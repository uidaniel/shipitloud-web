// Listening loop: find → free keyword score → AI score the best few in one batch → draft replies for the top ones.
import {
  BudgetExceededError, LISTEN_REPLY_SYSTEM, LISTEN_REPLY_VERSION, LISTEN_SCORE_SYSTEM, LISTEN_SCORE_VERSION, ReplySchema, ScoreSchema,
  fastModel, findUnsupportedClaims, generate, mockReply, mockScores, replyPrompt, scorePrompt, type BrandContext,
} from '@shipitloud/ai';
import { aiLedger, check, db, enqueue } from './db.ts';
import { PlanLimitError, brandContext } from './launch.ts';
import { readFeed, readProductHunt, searchBluesky, searchGitHub, searchHN, searchX, type Found } from './sources.ts';

const MAX_QUERIES = 12;
const KEEP_FROM = 25;          // free score needed to store a post at all
const AI_FROM = 40;            // free score needed to be sent to the AI
const BATCH = 15;
const BATCHES_PER_DAY = Number(process.env.LISTEN_BATCHES_PER_DAY ?? 6);
const AUTO_DRAFTS_PER_DAY = Number(process.env.LISTEN_AUTO_DRAFTS_PER_DAY ?? 5);

export const SOURCE_NAME: Record<string, string> = { hn: 'Hacker News', bluesky: 'Bluesky', github: 'GitHub', rss: 'RSS', producthunt: 'Product Hunt', x: 'X', indiehackers: 'Indie Hackers', reddit_extension: 'Reddit' };

const ASKING = /\b(looking for|recommend|recommendations?|suggestions?|any (good )?(tool|app|service|software|way)s?|alternatives? (to|for)|what do (you|people) use|how do (you|i|people)|is there (a|an|any)|need (a|an|some)|best way to|anyone (know|use|tried)|switch(ing)? from|fed up|tired of|struggl\w+|frustrat\w+)\b/i;
const PROMO = /\b(we('re| are) hiring|job opening|i built|i made|we built|we launched|launching today|show hn|check out my|my (new )?(app|startup|saas)|use code|discount|affiliate)\b/i;

const STOP = new Set(['that', 'this', 'with', 'from', 'your', 'have', 'they', 'their', 'them', 'what', 'when', 'into', 'just', 'like', 'more', 'than', 'then', 'there', 'about', 'would', 'could', 'should', 'which', 'while', 'where', 'other', 'without', 'every', 'people', 'thing', 'things', 'really', 'still', 'using', 'make', 'makes', 'made', 'need', 'needs', 'want', 'wants', 'help', 'helps', 'easy', 'simple', 'better', 'free', 'tool', 'tools', 'apps', 'work', 'works', 'time', 'straight']);
const words = (s: string) => s.toLowerCase().match(/[a-z0-9']{4,}/g) ?? [];
const GLUE = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'my', 'your', 'with', 'is', 'it']);
/** Every meaningful word, short ones included, so "invoice app" needs both "invoice" and "app". */
const tokens = (s: string) => (s.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((w) => !GLUE.has(w));
/** Rough, but consistent: invoice, invoices, invoicing → "invoic"; chase, chasing → "chas". */
const stem = (w: string) => w.replace(/s$/, '').replace(/(ing|ed)$/, '').replace(/e$/, '');
const HIRING = /\b(who is hiring|who wants to be hired|seeking freelancer|freelancer\? seeking|job board)\b/i;

/** Words that place a post in the product's domain, e.g. "invoice", "payment". Used to make competitor hits count only in context. */
export function domainWords(b: Pick<BrandContext, 'one_liner' | 'pain_points' | 'keywords'>, cfg: { keywords: string[]; competitors: string[] }) {
  const comp = new Set(cfg.competitors.flatMap(words).map(stem));
  return new Set([b.one_liner ?? '', ...b.pain_points, ...b.keywords, ...cfg.keywords].flatMap(words).filter((w) => !STOP.has(w)).map(stem).filter((w) => w.length >= 5 && !comp.has(w)));
}

/** Hard filter: the post must really be about the topic, not just share a word with it. */
export function topicMatch(f: Pick<Found, 'title' | 'text'>, cfg: { keywords: string[]; competitors: string[] }, domain: Set<string>): { kind: 'keyword' | 'competitor'; term: string } | null {
  const hay = `${f.title ?? ''} ${f.text}`;
  if (HIRING.test(f.title ?? '') || HIRING.test(f.text.slice(0, 200))) return null;
  const hw = new Set(words(hay).map(stem));
  const ht = new Set(tokens(hay).map(stem));
  for (const k of cfg.keywords) {
    const kw = tokens(k).map(stem);
    if (kw.length && kw.every((w) => ht.has(w))) return { kind: 'keyword', term: k };
  }
  for (const c of cfg.competitors) {
    if (!c.trim()) continue;
    // Case-sensitive as the founder typed it, so "Wave" (the product) doesn't match "wave".
    const re = new RegExp(`\\b${c.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(hay) && [...hw].filter((w) => domain.has(w)).length >= 2) return { kind: 'competitor', term: c };
  }
  return null;
}

/** Free relevance guess from wording alone, for posts that passed the topic filter. */
export function heuristicScore(f: Pick<Found, 'title' | 'text' | 'posted_at'>, b: Pick<BrandContext, 'pain_points' | 'competitors'>, matched: { kind: 'keyword' | 'competitor'; term: string }): number {
  const hay = `${f.title ?? ''} ${f.text}`;
  const head = `${f.title ?? ''} ${f.text.slice(0, 280)}`;
  let s = matched.kind === 'keyword' ? 30 : 25;
  if (ASKING.test(head)) s += 25;
  else if (ASKING.test(hay)) s += 10;
  if (head.includes('?')) s += 10;
  const hw = new Set(words(hay).map(stem));
  if (b.pain_points.some((p) => words(p).map(stem).filter((w) => !STOP.has(w) && hw.has(w)).length >= 2)) s += 15;
  if (PROMO.test(head)) s -= 25;
  if (f.posted_at && Date.now() - Date.parse(f.posted_at) < 48 * 3600_000) s += 10;
  if (f.text.length < 40) s -= 10;
  return Math.max(0, Math.min(100, s));
}

export function queriesFor(cfg: { keywords: string[]; competitors: string[] }) {
  const qs = [...cfg.keywords, ...cfg.competitors.flatMap((c) => [c, `alternative to ${c}`])].map((q) => q.trim()).filter(Boolean);
  return [...new Set(qs)].slice(0, MAX_QUERIES);
}

async function startOfDayCount(workspaceId: string, purpose: string) {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from('ai_calls').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('purpose', purpose).eq('ok', true).gte('created_at', since.toISOString());
  return count ?? 0;
}

/** Poll every enabled source and store what's worth a look. Backfill looks back 30 days (warm leads). */
export async function pollWorkspace(workspaceId: string, opts: { backfill?: boolean } = {}) {
  const ws = check(await db.from('workspaces').select('plan').eq('id', workspaceId).single(), 'ws')!;
  const cfg = (await db.from('listen_configs').select('*').eq('workspace_id', workspaceId).maybeSingle()).data;
  if (!cfg) return { found: 0, kept: 0 };
  const b = await brandContext(workspaceId);
  const { data: cap } = await db.from('plan_limits').select('monthly_cap').eq('plan', ws.plan).eq('metric', 'monitors').maybeSingle();
  const monitors = cap?.monthly_cap ?? 0;
  if (monitors <= 0) throw new PlanLimitError('Listening comes with the Launch Pass, Grow and Scale plans.');

  // Monitors = sources a plan may watch. X also needs Scale and a token.
  const sources = (cfg.sources as string[]).filter((s) => s !== 'x' || (ws.plan === 'scale' && process.env.X_BEARER_TOKEN)).filter((s) => s !== 'producthunt' || process.env.PRODUCTHUNT_TOKEN).slice(0, monitors);
  const since = opts.backfill ? new Date(Date.now() - 30 * 86_400_000) : new Date(Math.max(cfg.last_polled_at ? Date.parse(cfg.last_polled_at) - 10 * 60_000 : 0, Date.now() - 3 * 86_400_000));
  const queries = queriesFor(cfg);
  const terms = [...cfg.keywords, ...cfg.competitors];
  const domain = domainWords(b, cfg);
  const exclude = (cfg.exclude as string[]).map((e) => e.toLowerCase()).filter(Boolean);

  const found: (Found & { matched: string })[] = [];
  for (const q of queries) {
    const batch = await Promise.all([
      sources.includes('hn') ? searchHN(q, since) : [],
      sources.includes('bluesky') ? searchBluesky(q, since) : [],
      sources.includes('github') && queries.indexOf(q) < 3 ? searchGitHub(q, since) : [],
    ]);
    for (const f of batch.flat()) found.push({ ...f, matched: q });
    if (sources.includes('x')) {
      const { data: ok } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'x_reads', p_amount: 10, p_cost: 0 });
      if (ok) for (const f of await searchX(q, since, 10)) found.push({ ...f, matched: q });
    }
  }
  if (sources.includes('rss')) for (const feed of cfg.rss_feeds as string[]) for (const f of await readFeed(feed, terms, since)) found.push({ ...f, matched: terms.find((t) => `${f.title} ${f.text}`.toLowerCase().includes(t.toLowerCase())) ?? '' });
  if (sources.includes('producthunt')) for (const f of await readProductHunt(terms, since)) found.push({ ...f, matched: '' });

  const seen = new Set<string>();
  const rows = found
    .filter((f) => { const k = `${f.source}:${f.external_id}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .filter((f) => !exclude.some((e) => `${f.title ?? ''} ${f.text}`.toLowerCase().includes(e)))
    .map((f) => ({ ...f, topic: topicMatch(f, cfg, domain) }))
    .filter((f): f is typeof f & { topic: NonNullable<typeof f.topic> } => !!f.topic)
    .map((f) => ({ ...f, matched: f.topic.term, heuristic_score: heuristicScore(f, b, f.topic) }))
    .filter((f) => f.heuristic_score >= KEEP_FROM)
    .map((f) => ({
      workspace_id: workspaceId, source: f.source, external_id: f.external_id, url: f.url, author: f.author, title: f.title, text: f.text,
      posted_at: f.posted_at, matched: f.matched, heuristic_score: f.heuristic_score,
      expires_at: new Date(Math.max(Date.now(), Date.parse(f.posted_at ?? '') || Date.now()) + 7 * 86_400_000).toISOString(),
    }));
  let kept = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data } = await db.from('mentions').upsert(rows.slice(i, i + 200), { onConflict: 'workspace_id,source,external_id', ignoreDuplicates: true }).select('id');
    kept += data?.length ?? 0;
  }
  const scored = await scoreNew(workspaceId, b, opts.backfill ? 3 : 1);
  const drafted = await autoDraft(workspaceId, b, cfg.threshold);
  // Marked done only now, so the page doesn't say "finished" while drafts are still being written.
  await db.from('listen_configs').update({ last_polled_at: new Date().toISOString(), ...(opts.backfill ? { backfilled_at: new Date().toISOString() } : {}) }).eq('workspace_id', workspaceId);
  return { found: found.length, kept, scored, drafted };
}

/** AI-score the most promising unscored posts, a batch at a time, within the daily cap. */
export async function scoreNew(workspaceId: string, b: BrandContext, maxBatches = 1) {
  let scored = 0;
  for (let n = 0; n < maxBatches; n++) {
    if ((await startOfDayCount(workspaceId, 'listen_score')) >= BATCHES_PER_DAY) break;
    const { data: todo } = await db.from('mentions').select('id, source, title, text, heuristic_score').eq('workspace_id', workspaceId).is('relevance_score', null)
      .gte('heuristic_score', AI_FROM).neq('status', 'dismissed').order('heuristic_score', { ascending: false }).order('created_at', { ascending: false }).limit(BATCH);
    if (!todo?.length) break;
    // Short ids keep the prompt small; map back after.
    const items = todo.map((m, i) => ({ id: `p${i + 1}`, source: m.source, title: m.title, text: m.text }));
    let out;
    try {
      out = await generate({
        ledger: aiLedger, purpose: 'listen_score', promptVersion: LISTEN_SCORE_VERSION, workspaceId, model: fastModel(),
        system: LISTEN_SCORE_SYSTEM, user: scorePrompt(b, items), schema: ScoreSchema, maxTokens: 120 + items.length * 45, mock: () => mockScores(items),
      });
    } catch (err) {
      if (err instanceof BudgetExceededError) break;
      throw err;
    }
    for (const s of out.data.items) {
      const m = todo[Number(s.id.slice(1)) - 1];
      if (!m) continue;
      await db.from('mentions').update({ relevance_score: Math.max(0, Math.min(100, s.relevance)), intent: s.intent, reason: s.reason.slice(0, 200) }).eq('id', m.id);
      scored++;
    }
    // Anything the model skipped keeps its free score, marked as scored so it isn't sent again.
    const done = new Set(out.data.items.map((s) => s.id));
    for (const [i, m] of todo.entries()) if (!done.has(`p${i + 1}`)) await db.from('mentions').update({ relevance_score: m.heuristic_score, reason: 'Rough score only' }).eq('id', m.id).is('relevance_score', null);
  }
  return scored;
}

async function autoDraft(workspaceId: string, b: BrandContext, threshold: number) {
  let left = AUTO_DRAFTS_PER_DAY - (await startOfDayCount(workspaceId, 'listen_reply'));
  if (left <= 0) return 0;
  const { data: best } = await db.from('mentions').select('id').eq('workspace_id', workspaceId).eq('status', 'new').is('draft_asset_id', null)
    .gte('relevance_score', Math.max(threshold, 70)).order('relevance_score', { ascending: false }).limit(left);
  let n = 0;
  for (const m of best ?? []) {
    try { await draftReply(workspaceId, m.id, b); n++; } catch (err) { if (err instanceof PlanLimitError) break; throw err; }
    if (--left <= 0) break;
  }
  return n;
}

/** Draft one reply into the approval inbox. Counts as one AI draft on the plan. */
export async function draftReply(workspaceId: string, mentionId: string, brand?: BrandContext) {
  const m = check(await db.from('mentions').select('*').eq('id', mentionId).eq('workspace_id', workspaceId).single(), 'mention')!;
  if (m.draft_asset_id) return m.draft_asset_id as string;
  const b = brand ?? (await brandContext(workspaceId));
  const { data: ok } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'ai_drafts', p_amount: 1, p_cost: 0 });
  if (!ok) throw new PlanLimitError('You’ve used this month’s AI drafts.');
  let out;
  try {
    out = await generate({
      ledger: aiLedger, purpose: 'listen_reply', promptVersion: LISTEN_REPLY_VERSION, workspaceId, model: fastModel(),
      system: LISTEN_REPLY_SYSTEM, user: replyPrompt(b, m), schema: ReplySchema, maxTokens: 400, mock: () => mockReply(b),
    });
  } catch (err) {
    await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'ai_drafts', p_amount: -1, p_cost: 0 });
    throw err;
  }
  const flags = findUnsupportedClaims(out.data.reply, [b.one_liner, b.target_customer, ...b.pain_points].join(' '));
  const posted = Date.parse(m.posted_at ?? '') || Date.now();
  const asset = check(await db.from('assets').insert({
    workspace_id: workspaceId, type: 'reply', platform: m.source === 'reddit_extension' ? 'reddit' : m.source,
    title: `Reply to ${m.author ?? 'a post'} on ${SOURCE_NAME[m.source] ?? m.source}`,
    content: { text: out.data.reply, thread_url: m.url, mention_id: m.id, quote: (m.title ? `${m.title}: ` : '') + String(m.text).slice(0, 280), mentions_product: out.data.mentions_product },
    confidence: flags.length ? 60 : (m.relevance_score ?? m.heuristic_score), flags,
    expires_at: new Date(Math.max(Date.now() + 24 * 3600_000, posted + 72 * 3600_000)).toISOString(),
    prompt_version: LISTEN_REPLY_VERSION, model: out.model,
  }).select('id').single(), 'reply asset')!;
  await db.from('mentions').update({ draft_asset_id: asset.id, status: 'drafted' }).eq('id', m.id);
  await enqueue(workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
  return asset.id as string;
}
