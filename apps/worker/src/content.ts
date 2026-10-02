// Content engine: plan a week, write from a proven format, repurpose one idea, learn the founder's voice,
// and turn product updates (changelog feed, GitHub releases, webhook) into posts.
import {
  BudgetExceededError, CONTENT_FORMAT_SYSTEM, CONTENT_FORMAT_VERSION, CONTENT_WEEK_SYSTEM, CONTENT_WEEK_VERSION, FromFormatSchema, REPURPOSE_SYSTEM,
  REPURPOSE_VERSION, RepurposeSchema, VOICE_LEARN_SYSTEM, VOICE_LEARN_VERSION, VoiceLearnSchema, WeekSchema, brandBlock, contentWeekPrompt, fastModel,
  findUnsupportedClaims, fromFormatPrompt, generate, mockFromFormat, mockRepurpose, mockVoice, mockWeek, repurposePrompt, voiceLearnPrompt,
  type BrandContext, type FormatSpec,
} from '@shipitloud/ai';
import { PlanLimitError, brandContext, nextWeekdays, publishScore, validTimeZone, zonedTime } from '@shipitloud/engine';
import { TEMPLATES } from '@shipitloud/templates';
import { htmlToText } from './crawl.ts';
import { aiLedger, check, db, enqueue } from './db.ts';
import { posterFromSlots } from './posters.ts';

const POST_TIMES: Record<string, [number, number]> = { x: [9, 0], linkedin: [8, 30], whatsapp: [8, 0] };

async function consumeDrafts(workspaceId: string, n: number) {
  const { data } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'ai_drafts', p_amount: n, p_cost: 0 });
  if (!data) throw new PlanLimitError('You’ve used this month’s AI drafts, or your plan doesn’t include the content engine.');
}
const refund = (workspaceId: string, n: number) => db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'ai_drafts', p_amount: -n, p_cost: 0 });

async function timezoneOf(workspaceId: string) {
  const { data: ws } = await db.from('workspaces').select('owner_id').eq('id', workspaceId).single();
  const { data: p } = await db.from('profiles').select('timezone').eq('id', ws!.owner_id).maybeSingle();
  return validTimeZone(p?.timezone);
}

async function voiceSamples(workspaceId: string) {
  const { data } = await db.from('voice_profiles').select('sample_posts').eq('workspace_id', workspaceId).maybeSingle();
  return (data?.sample_posts ?? []) as string[];
}

/** Scores, claim flags and placeholders, applied the same way to every drafted post. */
/** Em dashes read as machine-written; swap them for the plain hyphen people type. */
export const humanize = (t: string) => t.replace(/\s*—\s*/g, ' - ');

function finish(b: BrandContext, platform: string, text: string, thread: string[], needsInput: boolean) {
  const flags = findUnsupportedClaims([text, ...thread].join(' '), brandBlock(b));
  if (needsInput || /\[[^\]]{3,60}\]/.test(text)) flags.push('Fill in the [bracketed] part with a real fact');
  const s = publishScore({ platform, text, thread: thread.length ? thread : undefined, flags });
  return { flags, score: s.score, tips: s.tips, confidence: flags.length ? 60 : Math.max(60, s.score) };
}

async function insertAndQueue(rows: Record<string, unknown>[]) {
  const { data, error } = await db.from('assets').insert(rows).select('id');
  if (error) throw new Error(`save posts: ${error.message}`);
  for (const a of data ?? []) await enqueue(String(rows[0]!.workspace_id), 'asset.intake', { asset_id: a.id }, { key: `intake:${a.id}` });
  return data?.length ?? 0;
}

async function formatsFor(workspaceId: string, preferUpdates: boolean): Promise<FormatSpec[]> {
  const { data: all } = await db.from('viral_formats').select('slug, name, platforms, hook_pattern, structure, example, needs, best_for, kind').eq('kind', 'post').or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: recent } = await db.from('assets').select('content').eq('workspace_id', workspaceId).eq('type', 'post').gte('created_at', since);
  const used = new Set((recent ?? []).map((r) => (r.content as { format_slug?: string })?.format_slug).filter(Boolean));
  const fresh = (all ?? []).filter((f) => !used.has(f.slug));
  const pool = (fresh.length >= 6 ? fresh : all ?? []).sort(() => Math.random() - 0.5);
  if (preferUpdates) pool.sort((a, b) => Number(b.best_for.includes('updates')) - Number(a.best_for.includes('updates')));
  return pool.slice(0, 8).map((f) => ({ slug: f.slug, name: f.name, platforms: f.platforms, hook_pattern: f.hook_pattern, structure: f.structure, example: f.example, needs: f.needs }));
}

/** A week of posts (3 X, 2 LinkedIn, a WhatsApp status), scheduled on the next five weekdays. */
export async function makeContentWeek(workspaceId: string) {
  const b = await brandContext(db, workspaceId);
  const [{ data: brain }, samples, tz, { data: updates }, { data: heard }] = await Promise.all([
    db.from('brand_brains').select('content_pillars').eq('workspace_id', workspaceId).single(),
    voiceSamples(workspaceId),
    timezoneOf(workspaceId),
    db.from('product_updates').select('id, title, body').eq('workspace_id', workspaceId).is('used_at', null).order('created_at', { ascending: false }).limit(4),
    db.from('mentions').select('title, text').eq('workspace_id', workspaceId).gte('score', 60).gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()).order('score', { ascending: false }).limit(8),
  ]);
  // Insights are paraphrased topics, never people: first line only, no handles or links.
  const insights = (heard ?? []).map((m) => (m.title || m.text).split('\n')[0]!.replace(/@\w+|https?:\/\/\S+/g, '').slice(0, 140)).filter(Boolean);
  const inputs = { pillars: brain?.content_pillars ?? [], samples, updates: (updates ?? []).map((u, i) => ({ ref: `u${i + 1}`, title: u.title, body: u.body ?? '' })), insights, formats: await formatsFor(workspaceId, !!updates?.length) };

  await consumeDrafts(workspaceId, 6);
  let out;
  try {
    out = await generate({
      ledger: aiLedger, purpose: 'content_week', promptVersion: CONTENT_WEEK_VERSION, workspaceId, model: fastModel(),
      system: CONTENT_WEEK_SYSTEM, user: contentWeekPrompt(b, inputs), schema: WeekSchema, maxTokens: 3500, mock: () => mockWeek(b, inputs),
    });
  } catch (err) {
    await refund(workspaceId, 6);
    if (err instanceof BudgetExceededError) throw new PlanLimitError('The AI budget for this month is used up.');
    throw err;
  }

  const days = nextWeekdays(5, tz);
  const order = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const posts = [...out.data.posts].sort((a, b2) => order.indexOf(a.day) - order.indexOf(b2.day)).slice(0, 5);
  const weekOf = `${days[0]!.y}-${String(days[0]!.m).padStart(2, '0')}-${String(days[0]!.d).padStart(2, '0')}`;
  const rows: Record<string, unknown>[] = [];
  for (const [i, p] of posts.entries()) {
    const upd = p.source === 'update' ? (updates ?? [])[Number(p.source_ref.replace(/\D/g, '')) - 1] : undefined;
    const { data: idea } = await db.from('content_ideas').insert({ workspace_id: workspaceId, title: p.title.slice(0, 120), pillar: p.pillar, source: p.source, source_ref: upd?.id ?? null, format_slug: p.format_slug, week_of: weekOf }).select('id').single();
    const thread = p.platform === 'x' && p.thread.length > 1 ? p.thread.map(humanize) : [];
    const text = thread.length ? thread.join('\n\n') : humanize(p.text);
    const f = finish(b, p.platform, text, thread, p.needs_input);
    const [hh, mm] = POST_TIMES[p.platform]!;
    rows.push({
      workspace_id: workspaceId, type: 'post', platform: p.platform, title: p.title.slice(0, 120), status: 'pending', prompt_version: CONTENT_WEEK_VERSION, model: out.model,
      content: { ref: 'content_week', text, ...(thread.length ? { thread } : {}), idea_id: idea?.id, format_slug: p.format_slug, pillar: p.pillar, source: p.source, score_tips: f.tips },
      scheduled_for: zonedTime(days[i]!, hh, mm, tz).toISOString(), flags: f.flags, publish_score: f.score, qa_score: f.score, confidence: f.confidence,
    });
  }
  const status = humanize(out.data.whatsapp_status);
  if (status.trim()) {
    const f = finish(b, 'whatsapp', status, [], false);
    rows.push({
      workspace_id: workspaceId, type: 'post', platform: 'whatsapp', title: 'WhatsApp status this week', status: 'pending', prompt_version: CONTENT_WEEK_VERSION, model: out.model,
      content: { ref: 'content_week', text: status, score_tips: f.tips }, scheduled_for: zonedTime(days[0]!, 8, 0, tz).toISOString(),
      flags: f.flags, publish_score: f.score, qa_score: f.score, confidence: f.confidence,
    });
  }
  // A new plan replaces last plan's posts that are still waiting, so the inbox never doubles up.
  await db.from('assets').update({ status: 'rejected' }).eq('workspace_id', workspaceId).eq('prompt_version', CONTENT_WEEK_VERSION).eq('status', 'pending');
  const n = await insertAndQueue(rows);
  if (updates?.length) await db.from('product_updates').update({ used_at: new Date().toISOString() }).in('id', updates.map((u) => u.id));
  await db.from('content_sources').upsert({ workspace_id: workspaceId, last_planned_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
  return n;
}

/** One post from a chosen format in the library, scheduled for the next weekday morning. */
export async function postFromFormat(workspaceId: string, slug: string, platform: 'x' | 'linkedin', topic = '', extra: { updateId?: string } = {}) {
  const b = await brandContext(db, workspaceId);
  const { data: f } = await db.from('viral_formats').select('slug, name, platforms, hook_pattern, structure, example, needs').eq('slug', slug).or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`).limit(1).single();
  if (!f) throw new Error(`Unknown format ${slug}`);
  const [samples, tz] = await Promise.all([voiceSamples(workspaceId), timezoneOf(workspaceId)]);
  await consumeDrafts(workspaceId, 1);
  let out;
  try {
    out = await generate({
      ledger: aiLedger, purpose: 'content_format', promptVersion: CONTENT_FORMAT_VERSION, workspaceId, model: fastModel(),
      system: CONTENT_FORMAT_SYSTEM, user: fromFormatPrompt(b, f, platform, samples, topic), schema: FromFormatSchema, maxTokens: 1200, mock: () => mockFromFormat(b, f, platform),
    });
  } catch (err) { await refund(workspaceId, 1); throw err; }
  const thread = platform === 'x' && out.data.thread.length > 1 ? out.data.thread.map(humanize) : [];
  const text = thread.length ? thread.join('\n\n') : humanize(out.data.text);
  const r = finish(b, platform, text, thread, out.data.needs_input);
  const [hh, mm] = POST_TIMES[platform]!;
  const { data: idea } = await db.from('content_ideas').insert({ workspace_id: workspaceId, title: out.data.title.slice(0, 120), source: extra.updateId ? 'update' : 'manual', source_ref: extra.updateId ?? null, format_slug: slug }).select('id').single();
  return insertAndQueue([{
    workspace_id: workspaceId, type: 'post', platform, title: out.data.title.slice(0, 120), status: 'pending', prompt_version: CONTENT_FORMAT_VERSION, model: out.model,
    content: { ref: 'content_format', text, ...(thread.length ? { thread } : {}), idea_id: idea?.id, format_slug: slug, score_tips: r.tips },
    scheduled_for: zonedTime(nextWeekdays(1, tz)[0]!, hh, mm, tz).toISOString(), flags: r.flags, publish_score: r.score, qa_score: r.score, confidence: r.confidence,
  }]);
}

/** One post becomes an X thread, a LinkedIn post, a WhatsApp status and a poster, spread over the next days. */
export async function repurpose(workspaceId: string, assetId: string) {
  const b = await brandContext(db, workspaceId);
  const src = check(await db.from('assets').select('id, platform, title, content').eq('id', assetId).eq('workspace_id', workspaceId).single(), 'source post')!;
  const original = { platform: src.platform ?? 'x', text: String((src.content as { text?: string }).text ?? '') };
  if (original.text.length < 40) throw new Error('That post is too short to repurpose.');
  const posterTemplates = TEMPLATES.filter((t) => ['quote', 'problem', 'steps', 'announce', 'feature'].includes(t.id)).map((t) => ({ id: t.id, name: t.name, slots: t.slots }));
  const tz = await timezoneOf(workspaceId);
  await consumeDrafts(workspaceId, 3);
  let out;
  try {
    out = await generate({
      ledger: aiLedger, purpose: 'repurpose', promptVersion: REPURPOSE_VERSION, workspaceId, model: fastModel(),
      system: REPURPOSE_SYSTEM, user: repurposePrompt(b, original, posterTemplates), schema: RepurposeSchema, maxTokens: 2500, mock: () => mockRepurpose(b),
    });
  } catch (err) { await refund(workspaceId, 3); throw err; }

  const ideaId = (src.content as { idea_id?: string }).idea_id
    ?? (await db.from('content_ideas').insert({ workspace_id: workspaceId, title: src.title.slice(0, 120), source: 'repurpose', source_ref: src.id }).select('id').single()).data?.id;
  const days = nextWeekdays(3, tz);
  const base = { workspace_id: workspaceId, type: 'post', status: 'pending', prompt_version: REPURPOSE_VERSION, model: out.model };
  const make = (platform: string, title: string, text: string, thread: string[], day: number) => {
    const f = finish(b, platform, text, thread, false);
    const [hh, mm] = POST_TIMES[platform] ?? [9, 0];
    return { ...base, platform, title, content: { ref: 'repurpose', text, ...(thread.length ? { thread } : {}), idea_id: ideaId, from_asset: src.id, score_tips: f.tips }, scheduled_for: zonedTime(days[day]!, hh, mm, tz).toISOString(), flags: f.flags, publish_score: f.score, qa_score: f.score, confidence: f.confidence };
  };
  const thread = out.data.x_thread.filter(Boolean).map(humanize);
  const rows = [
    ...(src.platform !== 'x' && thread.length ? [make('x', `Thread: ${src.title}`.slice(0, 120), thread.join('\n\n'), thread, 0)] : []),
    ...(src.platform !== 'linkedin' ? [make('linkedin', `LinkedIn: ${src.title}`.slice(0, 120), humanize(out.data.linkedin), [], 1)] : []),
    make('whatsapp', `WhatsApp status: ${src.title}`.slice(0, 120), humanize(out.data.whatsapp), [], 2),
  ];
  const n = await insertAndQueue(rows);
  const slots = Object.fromEntries(out.data.poster.slots.map((s) => [s.key, s.value]));
  const poster = await posterFromSlots(workspaceId, out.data.poster.template_id, slots, out.data.poster.title.slice(0, 120) || `Poster: ${src.title}`, { content: { idea_id: ideaId, from_asset: src.id }, scheduled_for: zonedTime(days[2]!, 12, 0, tz).toISOString() });
  return { posts: n, poster: 'assetId' in poster ? 1 : 0, skipped: 'skipped' in poster ? poster.skipped : null };
}

/** Learn the founder's voice from their own past posts. */
export async function learnVoice(workspaceId: string) {
  const samples = await voiceSamples(workspaceId);
  if (samples.length < 2) throw new Error('Add at least two of your own posts first.');
  const out = await generate({
    ledger: aiLedger, purpose: 'voice_learn', promptVersion: VOICE_LEARN_VERSION, workspaceId, model: fastModel(),
    system: VOICE_LEARN_SYSTEM, user: voiceLearnPrompt(samples), schema: VoiceLearnSchema, maxTokens: 700, mock: () => mockVoice(),
  });
  check(await db.from('voice_profiles').update({ tone: out.data.tone, style_notes: out.data.style_notes, dos: out.data.dos, donts: out.data.donts, updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId), 'save voice');
}

// ---------------------------------------------------------------- product updates
interface FeedItem { id: string; title: string; body: string; url: string; date: string | null }

async function readChangelog(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'ShipItLoudBot/1.0 (+https://shipitloud.netlify.app)' }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return [];
  const xml = (await res.text()).slice(0, 2_000_000);
  const tag = (s: string, ...names: string[]) => {
    for (const n of names) { const m = s.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, 'i')); if (m?.[1]) return m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim(); }
    return '';
  };
  return (xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? []).slice(0, 10).map((it) => {
    const link = tag(it, 'link') || it.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '';
    return { id: tag(it, 'guid', 'id') || link, title: htmlToText(tag(it, 'title')).slice(0, 200), body: htmlToText(tag(it, 'description', 'content:encoded', 'content', 'summary')).slice(0, 2000), url: link, date: tag(it, 'pubDate', 'updated', 'published') || null };
  }).filter((i) => i.id && i.title);
}

async function readReleases(repo: string): Promise<FeedItem[]> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return [];
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'ShipItLoudBot/1.0', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=5`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return [];
  const rel = (await res.json()) as { id: number; name: string | null; tag_name: string; body: string | null; html_url: string; published_at: string | null; draft: boolean }[];
  return rel.filter((r) => !r.draft).map((r) => ({ id: String(r.id), title: r.name || r.tag_name, body: (r.body ?? '').slice(0, 2000), url: r.html_url, date: r.published_at }));
}

/** Read the changelog feed and GitHub releases. New items each trigger an announcement post. */
export async function checkUpdates(workspaceId: string) {
  const { data: src } = await db.from('content_sources').select('changelog_url, github_repo, last_checked_at').eq('workspace_id', workspaceId).maybeSingle();
  if (!src) return 0;
  const firstSync = !src.last_checked_at;
  const found: { source: string; item: FeedItem }[] = [
    ...(src.changelog_url ? (await readChangelog(src.changelog_url)).map((item) => ({ source: 'changelog', item })) : []),
    ...(src.github_repo ? (await readReleases(src.github_repo)).map((item) => ({ source: 'github_release', item })) : []),
  ];
  await db.from('content_sources').update({ last_checked_at: new Date().toISOString() }).eq('workspace_id', workspaceId);
  let fresh = 0;
  for (const [i, f] of found.entries()) {
    // On the first sync only the newest item counts; older history isn't news.
    const old = firstSync && i > 0;
    const { data } = await db.from('product_updates').upsert({
      workspace_id: workspaceId, source: f.source, external_id: f.item.id.slice(0, 300), title: f.item.title, body: f.item.body, url: f.item.url || null,
      published_at: f.item.date && !Number.isNaN(Date.parse(f.item.date)) ? new Date(f.item.date).toISOString() : null, used_at: old ? new Date().toISOString() : null,
    }, { onConflict: 'workspace_id,source,external_id', ignoreDuplicates: true }).select('id');
    for (const u of data ?? []) if (!old) { fresh++; await enqueue(workspaceId, 'content.update_posts', { update_id: u.id }, { key: `update:${u.id}` }); }
  }
  return fresh;
}

/** A shipped update becomes a ship-log post on X and a before/after post on LinkedIn. */
export async function postsForUpdate(workspaceId: string, updateId: string) {
  const { data: u } = await db.from('product_updates').select('id, title, body, used_at').eq('id', updateId).eq('workspace_id', workspaceId).single();
  if (!u || u.used_at) return 0;
  const topic = `This just shipped: ${u.title}. ${u.body ?? ''}`.slice(0, 1500);
  const n = (await postFromFormat(workspaceId, 'ship-log', 'x', topic, { updateId: u.id })) + (await postFromFormat(workspaceId, 'before-after', 'linkedin', topic, { updateId: u.id }));
  await db.from('product_updates').update({ used_at: new Date().toISOString() }).eq('id', u.id);
  return n;
}
