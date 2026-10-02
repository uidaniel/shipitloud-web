import type { NextRequest } from 'next/server';
import { AI_FROM, KEEP_FROM, brandContext, domainWords, heuristicScore, scoreNew, topicMatch } from '@shipitloud/engine';
import { extAuth, json, listenTerms, preflightResponse } from '@/lib/ext';

// Posts read by the extension in the founder's browser: filter, free-score, store, and AI-score the best few.
interface InPost { id: string; subreddit: string; title: string; text: string; author: string | null; url: string; created_utc: number | null }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function POST(req: NextRequest) {
  const ctx = await extAuth(req);
  if (!('db' in ctx)) return ctx;
  const { db, workspaceId } = ctx;
  const body = (await req.json().catch(() => null)) as { posts?: unknown[]; force?: boolean } | null;
  const posts: InPost[] = (Array.isArray(body?.posts) ? body.posts : []).slice(0, 50).map((p) => {
    const o = p as Record<string, unknown>;
    return { id: str(o.id, 20), subreddit: str(o.subreddit, 60).replace(/^r\//i, ''), title: str(o.title, 400), text: str(o.text, 3000), author: str(o.author, 60) || null, url: str(o.url, 500), created_utc: typeof o.created_utc === 'number' ? o.created_utc : null };
  }).filter((p) => /^t3_[a-z0-9]+$/i.test(p.id) && /^https:\/\/(www|old)\.reddit\.com\//.test(p.url));
  if (!posts.length) return json(req, { results: [] });

  const { data: cap } = await db.from('plan_limits').select('monthly_cap').eq('plan', ctx.plan).eq('metric', 'monitors').maybeSingle();
  if ((cap?.monthly_cap ?? 0) <= 0) return json(req, { error: 'Listening comes with the Launch Pass and paid plans.' }, 402);

  let b;
  try { b = await brandContext(db, workspaceId); } catch { return json(req, { error: 'Finish setting up your brand in ShipItLoud first.' }, 409); }
  const terms = await listenTerms(db, workspaceId);
  const domain = domainWords(b, terms);
  const exclude = terms.exclude.map((e) => e.toLowerCase());
  // On a single thread the founder chose to open, keep it even if it's off our keywords.
  const force = body?.force === true && posts.length === 1;

  const rows = posts.flatMap((p) => {
    const t = { title: p.title, text: p.text || p.title, posted_at: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null };
    if (exclude.some((e) => `${p.title} ${p.text}`.toLowerCase().includes(e)) && !force) return [];
    const topic = topicMatch(t, terms, domain) ?? (force ? { kind: 'keyword' as const, term: '' } : null);
    if (!topic) return [];
    const h = heuristicScore(t, b, topic);
    if (h < KEEP_FROM && !force) return [];
    return [{
      workspace_id: workspaceId, source: 'reddit_extension', external_id: p.id, url: p.url, author: p.author, title: p.title, text: t.text,
      posted_at: t.posted_at, matched: topic.term || `r/${p.subreddit}`, heuristic_score: h,
      expires_at: new Date(Math.max(Date.now(), Date.parse(t.posted_at ?? '') || Date.now()) + 7 * 86_400_000).toISOString(),
    }];
  });
  if (rows.length) await db.from('mentions').upsert(rows, { onConflict: 'workspace_id,source,external_id', ignoreDuplicates: true });

  const ids = posts.map((p) => p.id);
  const select = () => db.from('mentions').select('id, external_id, heuristic_score, relevance_score, score, intent, reason, status, draft_asset_id').eq('workspace_id', workspaceId).eq('source', 'reddit_extension').in('external_id', ids);
  const { data: stored } = await select();
  const toScore = (stored ?? []).filter((m) => m.relevance_score == null && m.heuristic_score >= AI_FROM && m.status !== 'dismissed').map((m) => m.id);
  if (toScore.length) await scoreNew(db, workspaceId, b, { onlyIds: toScore });
  const { data: final } = toScore.length ? await select() : { data: stored };
  const byId = new Map((final ?? []).map((m) => [m.external_id, m]));

  return json(req, {
    threshold: terms.threshold,
    results: posts.map((p) => {
      const m = byId.get(p.id);
      return m
        ? { id: p.id, mention_id: m.id, score: m.score, rough: m.relevance_score == null, intent: m.intent, reason: m.reason, status: m.status, drafted: !!m.draft_asset_id }
        : { id: p.id, score: null };
    }),
  });
}

export const OPTIONS = preflightResponse;
