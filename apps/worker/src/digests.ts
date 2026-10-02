// Weekly digest and the first 7 days report: numbers from the data, next actions by rule, a few sentences of AI
// wording that must only use those numbers. Stored for the Momentum page and sent on the owner's channels.
import { DIGEST_SYSTEM, DIGEST_VERSION, DigestSchema, digestPrompt, fastModel, generate, mockDigest } from '@shipitloud/ai';
import {
  digestStats, digestText, fallbackSummary, localDate, nextActions, quiet, statsBlock, unknownNumbers, validTimeZone,
  type DigestChannel, type DigestDay, type DigestSignals,
} from '@shipitloud/engine';
import { aiLedger, check, db, enqueue } from './db.ts';
import { humanize } from './content.ts';
import { appUrl } from './env.ts';

export type DigestKind = 'weekly' | 'first_week';
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string) => { const r = await q; if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.count ?? 0; };

async function signals(ws: string): Promise<DigestSignals> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [pending, unanswered, listen, snippet, sources, published, blog, page, email] = await Promise.all([
    count(db.from('assets').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('status', 'pending'), 'pending'),
    count(db.from('mentions').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).gte('score', 70).in('status', ['new', 'drafted']).gte('created_at', since), 'unanswered'),
    db.from('listen_configs').select('active').eq('workspace_id', ws).maybeSingle(),
    count(db.from('track_events').select('id', { count: 'exact', head: true }).eq('workspace_id', ws), 'snippet'),
    db.from('content_sources').select('weekly_plan').eq('workspace_id', ws).maybeSingle(),
    count(db.from('assets').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('status', 'published'), 'published'),
    count(db.from('blog_posts').select('id', { count: 'exact', head: true }).eq('workspace_id', ws), 'blog'),
    db.from('waitlist_pages').select('published_at').eq('workspace_id', ws).not('published_at', 'is', null).limit(1).maybeSingle(),
    db.from('email_settings').select('sequence_on').eq('workspace_id', ws).maybeSingle(),
  ]);
  return {
    pending, unanswered, listening: !!listen.data?.active, snippet: snippet > 0, weekly_plan: !!sources.data?.weekly_plan,
    published_total: published, blog_posts: blog, waitlist: !!page.data, sequence_on: !!email.data?.sequence_on,
  };
}

async function topLink(ws: string, from: string) {
  const rows = check(await db.from('link_clicks').select('clicks, short_links!inner(workspace_id, target_url, source)').eq('short_links.workspace_id', ws).gte('day', from), 'top link') as unknown as
    { clicks: number; short_links: { target_url: string; source: string } }[];
  const by = new Map<string, { url: string; source: string; clicks: number }>();
  for (const r of rows) {
    const k = `${r.short_links.target_url}|${r.short_links.source}`;
    const cur = by.get(k) ?? { url: r.short_links.target_url, source: r.short_links.source, clicks: 0 };
    cur.clicks += r.clicks;
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.clicks - a.clicks)[0];
}

/** Build (or rebuild) this period's digest. `notify` sends it to the owner; a digest asked for in the app just shows. */
export async function buildDigest(ws: string, kind: DigestKind, opts: { notify?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const w = check(await db.from('workspaces').select('product_name, owner_id, created_at').eq('id', ws).single(), 'workspace')!;
  const prof = w.owner_id ? check(await db.from('profiles').select('timezone').eq('id', w.owner_id).maybeSingle(), 'profile') : null;
  const today = localDate(now, validTimeZone(prof?.timezone));
  const end = Date.UTC(today.y, today.m - 1, today.d) - 86_400_000;     // yesterday: the last full day
  const period = { start: iso(end - 6 * 86_400_000), end: iso(end) };

  const [{ data: daily, error: e1 }, { data: channels, error: e2 }, high, link, g] = await Promise.all([
    db.rpc('momentum_daily', { p_ws: ws, p_days: 15 }),
    db.rpc('momentum_channels', { p_ws: ws, p_days: 30 }),
    count(db.from('mentions').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).gte('score', 70).gte('created_at', `${period.start}T00:00:00Z`), 'high intent'),
    topLink(ws, period.start),
    signals(ws),
  ]);
  if (e1 || e2) throw new Error(`momentum: ${(e1 ?? e2)!.message}`);
  // momentum_daily ends today (UTC); drop today so the week is seven full days.
  const days = ((daily ?? []) as DigestDay[]).filter((d) => d.day <= period.end);
  const stats = digestStats(days, (channels ?? []) as DigestChannel[], { top_link: link, high_intent: high },
    // No "week before" to compare with until the workspace is two weeks old.
    kind === 'first_week' || Date.parse(period.start) - Date.parse(w.created_at) < 6 * 86_400_000);

  let copy = fallbackSummary(stats, kind);
  let model: string | null = null;
  if (!quiet(stats)) {
    const facts = statsBlock(stats, kind);
    try {
      const out = await generate({
        ledger: aiLedger, purpose: 'digest', promptVersion: DIGEST_VERSION, workspaceId: ws, model: fastModel(),
        system: DIGEST_SYSTEM, user: digestPrompt(w.product_name, facts), schema: DigestSchema, maxTokens: 500, mock: () => mockDigest(facts),
      });
      const words = { summary: humanize(out.data.summary), worked: out.data.worked.map(humanize).filter(Boolean).slice(0, 3) };
      // The AI may only use our numbers. If it invents one, the plain version goes out instead.
      if (!unknownNumbers(`${words.summary} ${words.worked.join(' ')}`, stats).length) { copy = words; model = out.model; }
    } catch { /* the plain version is fine: never block the digest on the AI */ }
  }
  const actions = nextActions(stats, g, `${appUrl()}/app/${ws}`);

  const row = check(await db.from('digests').upsert({
    workspace_id: ws, kind, period_start: period.start, period_end: period.end, stats: { ...stats, model }, summary: copy.summary, worked: copy.worked, actions,
  }, { onConflict: 'workspace_id,kind,period_start' }).select('id, sent_at').single(), 'save digest')!;

  if (opts.notify && !row.sent_at) {
    const title = kind === 'first_week' ? `Your first 7 days with ShipItLoud` : `Your week: ${stats.totals.signups} signup${stats.totals.signups === 1 ? '' : 's'}, ${stats.totals.clicks} click${stats.totals.clicks === 1 ? '' : 's'}`;
    await enqueue(ws, 'notify', { kind: 'digest', title, body: digestText({ ...copy, actions }), url: `${appUrl()}/app/${ws}/analytics#digest` }, { key: `notify:digest:${row.id}` });
    await db.from('digests').update({ sent_at: new Date().toISOString() }).eq('id', row.id);
  }
  return row.id as string;
}

/** Which digests are due now: the weekly one on Monday morning in the owner's timezone, the first-week report once. */
export async function dueDigests(now = new Date()) {
  const rows = check(await db.from('workspaces').select('id, created_at, owner_id'), 'workspaces') as { id: string; created_at: string; owner_id: string | null }[];
  const owners = [...new Set(rows.map((r) => r.owner_id).filter((x): x is string => !!x))];
  const tzs = new Map<string, string>();
  for (let i = 0; i < owners.length; i += 200) {
    const p = check(await db.from('profiles').select('id, timezone').in('id', owners.slice(i, i + 200)), 'timezones') as { id: string; timezone: string }[];
    for (const x of p) tzs.set(x.id, x.timezone);
  }
  const out: { ws: string; kind: DigestKind; key: string }[] = [];
  for (const r of rows) {
    if (!r.owner_id) continue;
    const age = now.getTime() - Date.parse(r.created_at);
    if (age >= 7 * 86_400_000 && age < 9 * 86_400_000) out.push({ ws: r.id, kind: 'first_week', key: `first:${r.id}` });
    const tz = validTimeZone(r.owner_id ? tzs.get(r.owner_id) : null);
    const local = localDate(now, tz);
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now));
    // A weekly digest needs a full week behind it, and the first-week report covers week one.
    if (local.weekday === 'Mon' && hour >= 8 && age >= 9 * 86_400_000) out.push({ ws: r.id, kind: 'weekly', key: `weekly:${r.id}:${local.y}-${local.m}-${local.d}` });
  }
  return out;
}
