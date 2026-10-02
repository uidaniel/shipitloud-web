// Listening rules and AI steps shared by the worker (polling) and the web app (Chrome extension API).
// Pipeline: strict topic filter → free wording score → AI score the best few in one batch → draft replies.
import {
  BudgetExceededError, LISTEN_REPLY_SYSTEM, LISTEN_REPLY_VERSION, LISTEN_SCORE_SYSTEM, LISTEN_SCORE_VERSION, ReplySchema, ScoreSchema,
  fastModel, findUnsupportedClaims, generate, mockReply, mockScores, replyPrompt, scorePrompt, type BrandContext,
} from '@shipitloud/ai';
import { brandContext } from './brand.ts';
import { PlanLimitError, callsToday, check, consume, enqueue, ledgerFor, type Db } from './db.ts';

/** The text fields every listening post has, whatever its source. */
export interface PostText { title: string | null; text: string; posted_at: string | null }

export const KEEP_FROM = 25;   // free score needed to store a post at all
export const AI_FROM = 40;     // free score needed to be sent to the AI
const MAX_QUERIES = 12;
const BATCH = 15;
const batchesPerDay = () => Number(process.env.LISTEN_BATCHES_PER_DAY ?? 6);
const autoDraftsPerDay = () => Number(process.env.LISTEN_AUTO_DRAFTS_PER_DAY ?? 5);

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
export function topicMatch(f: Pick<PostText, 'title' | 'text'>, cfg: { keywords: string[]; competitors: string[] }, domain: Set<string>): { kind: 'keyword' | 'competitor'; term: string } | null {
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
export function heuristicScore(f: PostText, b: Pick<BrandContext, 'pain_points' | 'competitors'>, matched: { kind: 'keyword' | 'competitor'; term: string }): number {
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

/** AI-score the most promising unscored posts, a batch at a time, within the daily cap. `onlyIds` limits it to given posts. */
export async function scoreNew(db: Db, workspaceId: string, b: BrandContext, opts: { maxBatches?: number; onlyIds?: string[] } = {}) {
  const ledger = ledgerFor(db);
  let scored = 0;
  for (let n = 0; n < (opts.maxBatches ?? 1); n++) {
    if ((await callsToday(db, workspaceId, 'listen_score')) >= batchesPerDay()) break;
    let q = db.from('mentions').select('id, source, title, text, heuristic_score').eq('workspace_id', workspaceId).is('relevance_score', null)
      .gte('heuristic_score', AI_FROM).neq('status', 'dismissed');
    if (opts.onlyIds) q = q.in('id', opts.onlyIds);
    const { data: todo } = await q.order('heuristic_score', { ascending: false }).order('created_at', { ascending: false }).limit(BATCH);
    if (!todo?.length) break;
    // Short ids keep the prompt small; map back after.
    const items = todo.map((m, i) => ({ id: `p${i + 1}`, source: m.source, title: m.title, text: m.text }));
    let out;
    try {
      out = await generate({
        ledger, purpose: 'listen_score', promptVersion: LISTEN_SCORE_VERSION, workspaceId, model: fastModel(),
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

/** Draft replies on our own for the strongest new conversations, within the daily cap. */
export async function autoDraft(db: Db, workspaceId: string, b: BrandContext, threshold: number) {
  let left = autoDraftsPerDay() - (await callsToday(db, workspaceId, 'listen_reply'));
  if (left <= 0) return 0;
  const { data: best } = await db.from('mentions').select('id').eq('workspace_id', workspaceId).eq('status', 'new').is('draft_asset_id', null)
    .gte('relevance_score', Math.max(threshold, 70)).order('relevance_score', { ascending: false }).limit(left);
  let n = 0;
  for (const m of best ?? []) {
    try { await draftReply(db, workspaceId, m.id, b); n++; } catch (err) { if (err instanceof PlanLimitError) break; throw err; }
    if (--left <= 0) break;
  }
  return n;
}

/** Draft one reply into the approval inbox. Counts as one AI draft on the plan. Returns the asset and its text. */
export async function draftReply(db: Db, workspaceId: string, mentionId: string, brand?: BrandContext): Promise<{ assetId: string; text: string; flags: string[] }> {
  const m = check(await db.from('mentions').select('*').eq('id', mentionId).eq('workspace_id', workspaceId).single(), 'mention')!;
  if (m.draft_asset_id) {
    const { data: a } = await db.from('assets').select('content, flags').eq('id', m.draft_asset_id).maybeSingle();
    return { assetId: m.draft_asset_id as string, text: String((a?.content as { text?: string } | null)?.text ?? ''), flags: a?.flags ?? [] };
  }
  const b = brand ?? (await brandContext(db, workspaceId));
  if (!(await consume(db, workspaceId, 'ai_drafts'))) throw new PlanLimitError('You’ve used this month’s AI drafts.');
  let out;
  try {
    out = await generate({
      ledger: ledgerFor(db), purpose: 'listen_reply', promptVersion: LISTEN_REPLY_VERSION, workspaceId, model: fastModel(),
      system: LISTEN_REPLY_SYSTEM, user: replyPrompt(b, m), schema: ReplySchema, maxTokens: 400, mock: () => mockReply(b),
    });
  } catch (err) {
    await consume(db, workspaceId, 'ai_drafts', -1);
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
  await enqueue(db, workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
  return { assetId: asset.id as string, text: out.data.reply, flags };
}
