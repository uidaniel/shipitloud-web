// Listening poller: fetch each enabled source, keep on-topic posts, then hand off to the shared engine
// (AI scoring and reply drafting live in @shipitloud/engine so the Chrome extension API uses the same rules).
import { KEEP_FROM, PlanLimitError, autoDraft, brandContext, domainWords, heuristicScore, queriesFor, scoreNew, topicMatch } from '@shipitloud/engine';
import { check, db } from './db.ts';
import { readFeed, readProductHunt, searchBluesky, searchGitHub, searchHN, searchX, type Found } from './sources.ts';

/** Poll every enabled source and store what's worth a look. Backfill looks back 30 days (warm leads). */
export async function pollWorkspace(workspaceId: string, opts: { backfill?: boolean } = {}) {
  const ws = check(await db.from('workspaces').select('plan').eq('id', workspaceId).single(), 'ws')!;
  const cfg = (await db.from('listen_configs').select('*').eq('workspace_id', workspaceId).maybeSingle()).data;
  if (!cfg) return { found: 0, kept: 0 };
  const b = await brandContext(db, workspaceId);
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
  const scored = await scoreNew(db, workspaceId, b, { maxBatches: opts.backfill ? 3 : 1 });
  const drafted = await autoDraft(db, workspaceId, b, cfg.threshold);
  // Marked done only now, so the page doesn't say "finished" while drafts are still being written.
  await db.from('listen_configs').update({ last_polled_at: new Date().toISOString(), ...(opts.backfill ? { backfilled_at: new Date().toISOString() } : {}) }).eq('workspace_id', workspaceId);
  return { found: found.length, kept, scored, drafted };
}
