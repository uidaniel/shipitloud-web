import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { draftMention, listenNow, setListening, setMentionStatus } from '../../actions';
import { smartLinks } from '@/lib/smart-links';
import { KitRefresher } from '../kit/refresher';
import { ListenForm, type ListenValues } from './listen-form';

export const metadata: Metadata = { title: 'Listening' };

const SOURCE: Record<string, { name: string; icon: Platform }> = {
  hn: { name: 'Hacker News', icon: 'hn' }, bluesky: { name: 'Bluesky', icon: 'bluesky' }, github: { name: 'GitHub', icon: 'github' },
  rss: { name: 'RSS', icon: 'rss' }, producthunt: { name: 'Product Hunt', icon: 'producthunt' }, x: { name: 'X', icon: 'x' },
  indiehackers: { name: 'Indie Hackers', icon: 'indiehackers' }, reddit_extension: { name: 'Reddit', icon: 'reddit' },
};
const INTENT: Record<string, string> = { asking_for_tool: 'Asking for a tool', complaint: 'Complaint', competitor_mention: 'Mentions a competitor', discussion: 'Discussion', other: 'Other' };
const FILTERS = [{ key: 'best', label: 'Worth a reply' }, { key: 'all', label: 'Everything' }, { key: 'drafted', label: 'Drafted' }, { key: 'dismissed', label: 'Dismissed' }] as const;

function ago(iso: string | null) {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}


export default async function Listening({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ f?: string; edit?: string }> }) {
  const { ws: id } = await params;
  const { f = 'best', edit } = await searchParams;
  const { sb, ws } = await requireWorkspace(id);
  const [{ data: cfg }, { data: brain }, { data: cap }, { data: jobs }, { data: redditPost }] = await Promise.all([
    sb.from('listen_configs').select('*').eq('workspace_id', id).maybeSingle(),
    sb.from('brand_brains').select('status, keywords, competitors, pain_points').eq('workspace_id', id).maybeSingle(),
    sb.from('plan_limits').select('monthly_cap').eq('plan', ws.plan).eq('metric', 'monitors').maybeSingle(),
    sb.from('jobs').select('type, payload').eq('workspace_id', id).in('type', ['listen.poll', 'listen.draft']).in('status', ['queued', 'running']),
    sb.from('assets').select('content').eq('workspace_id', id).eq('prompt_version', 'launch_posts@1').eq('platform', 'reddit').limit(1).maybeSingle(),
  ]);
  const monitors = cap?.monthly_cap ?? 0;
  const polling = jobs?.some((j) => j.type === 'listen.poll') ?? false;
  const drafting = new Set((jobs ?? []).filter((j) => j.type === 'listen.draft').map((j) => String((j.payload as { mention_id?: string }).mention_id)));
  const backfilling = polling && !cfg?.backfilled_at;

  const options = [
    { id: 'hn', name: 'Hacker News', icon: 'hn' as const, note: 'Posts and comments' },
    { id: 'bluesky', name: 'Bluesky', icon: 'bluesky' as const, note: 'Public posts' },
    { id: 'github', name: 'GitHub', icon: 'github' as const, note: 'Issues. Best for developer tools' },
    { id: 'rss', name: 'RSS feeds', icon: 'rss' as const, note: 'Blogs and forums you choose' },
    { id: 'producthunt', name: 'Product Hunt', icon: 'producthunt' as const, note: 'New launches in your space', locked: process.env.PRODUCTHUNT_TOKEN ? undefined : 'Coming soon' },
    { id: 'x', name: 'X', icon: 'x' as const, note: 'Live posts, capped reads', locked: ws.plan !== 'scale' ? 'Scale plan' : process.env.X_BEARER_TOKEN ? undefined : 'Coming soon' },
  ];

  if (monitors <= 0) {
    return (
      <div className="pr-body">
        <div className="pr-list"><div className="pr-empty">
          <h2>Find people who need {ws.product_name}</h2>
          <p>Listening watches Hacker News, Bluesky and more for people asking for what you built, then drafts honest replies for you to approve. It comes with the Launch Pass and paid plans.</p>
          <Link className="pr-btn pr-btn-primary" href="/pricing" style={{ marginTop: 14 }}>See plans</Link>
        </div></div>
      </div>
    );
  }

  // First run: prefill from the brand brain.
  if (!cfg?.active && !cfg?.backfilled_at) {
    if (brain?.status !== 'ready') {
      return <div className="pr-body"><div className="pr-list"><div className="pr-empty"><h2>Set up your brand first</h2><p>We listen for your customers&apos; problems, so we need to know them.</p><Link className="pr-btn pr-btn-primary" href={`/app/setup/${id}`} style={{ marginTop: 14 }}>Set up your brand</Link></div></div></div>;
    }
    const values: ListenValues = cfg ? { keywords: cfg.keywords, competitors: cfg.competitors, exclude: cfg.exclude, sources: cfg.sources, rss_feeds: cfg.rss_feeds, threshold: cfg.threshold } : {
      keywords: (brain.keywords ?? []).filter((k: string) => k.split(' ').length <= 4).slice(0, 6),
      competitors: (brain.competitors ?? []).slice(0, 3), exclude: [], sources: ['hn', 'bluesky'].slice(0, monitors), rss_feeds: [], threshold: 60,
    };
    return (
      <div className="pr-body" style={{ display: 'grid', gap: 18, maxWidth: 820 }}>
        <div>
          <h1 className="pr-h1">Find people who need {ws.product_name}</h1>
          <p className="pr-lead">We check for new conversations every 20 minutes and look back over the last 30 days to start. You approve every reply; nothing posts on its own.</p>
        </div>
        <ListenForm ws={id} values={values} options={options} monitors={monitors} start />
        <p className="pr-hint" style={{ margin: 0 }}>What to expect: replies and your own network bring the first signups in week one. Content builds over weeks two to six.</p>
      </div>
    );
  }

  let q = sb.from('mentions').select('id, source, url, author, title, text, posted_at, matched, heuristic_score, relevance_score, score, intent, reason, status, draft_asset_id, assets:draft_asset_id(status)')
    .eq('workspace_id', id).order('score', { ascending: false }).order('created_at', { ascending: false }).limit(60);
  if (f === 'best') q = q.gte('score', cfg.threshold).in('status', ['new', 'drafted']).gt('expires_at', new Date().toISOString());
  else if (f === 'drafted') q = q.in('status', ['drafted', 'replied']);
  else if (f === 'dismissed') q = q.eq('status', 'dismissed');
  else q = q.neq('status', 'dismissed');
  const [{ data: mentions }, { count: bestCount }] = await Promise.all([
    q,
    sb.from('mentions').select('id', { count: 'exact', head: true }).eq('workspace_id', id).gte('score', cfg.threshold).in('status', ['new', 'drafted']).gt('expires_at', new Date().toISOString()),
  ]);

  // Smart search links: Reddit and Indie Hackers are read in the founder's own browser, never by us.
  const subs = ((redditPost?.content as { subreddits?: string[] } | null)?.subreddits ?? []);
  const links = smartLinks(cfg, subs, ws.plan);

  return (
    <div className="pr-body pr-listen">
      {(polling || drafting.size > 0) && <KitRefresher />}
      <div className="pr-listen-main">
        <div className="pr-listen-head">
          <div className="pr-status">
            <span className={`pr-live${cfg.active ? " on" : ""}`} aria-hidden="true" />
            <div>
              <b>{cfg.active ? 'Listening' : 'Paused'}</b>
              <span>{polling ? (backfilling ? 'Looking back over the last 30 days…' : 'Checking now…') : cfg.last_polled_at ? `Last checked ${ago(cfg.last_polled_at)}` : 'Not checked yet'} · {cfg.sources.map((s: string) => SOURCE[s]?.name ?? s).join(', ')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cfg.active && (
              <form action={listenNow}><input type="hidden" name="ws" value={id} /><Submit className="pr-btn" pending="Checking…" disabled={polling}>Check now</Submit></form>
            )}
            <form action={setListening}>
              <input type="hidden" name="ws" value={id} /><input type="hidden" name="on" value={cfg.active ? 'false' : 'true'} />
              <Submit className={cfg.active ? 'pr-btn pr-btn-ghost' : 'pr-btn pr-btn-primary'} pending={cfg.active ? 'Pausing…' : 'Resuming…'}>{cfg.active ? 'Pause' : 'Resume'}</Submit>
            </form>
            <Link className="pr-btn pr-btn-ghost" href={edit ? `/app/${id}/listening` : `/app/${id}/listening?edit=1`} aria-expanded={!!edit}>{Icon.settings} Settings</Link>
          </div>
        </div>

        {edit && (
          <ListenForm ws={id} monitors={monitors} options={options}
            values={{ keywords: cfg.keywords, competitors: cfg.competitors, exclude: cfg.exclude, sources: cfg.sources, rss_feeds: cfg.rss_feeds, threshold: cfg.threshold }} />
        )}

        <nav className="pr-tabs" aria-label="Filter conversations">
          {FILTERS.map((t) => (
            <Link key={t.key} href={t.key === 'best' ? `/app/${id}/listening` : `/app/${id}/listening?f=${t.key}`} aria-current={f === t.key ? 'page' : undefined}>
              {t.label}{t.key === 'best' && bestCount ? <span className="pr-count">{bestCount}</span> : null}
            </Link>
          ))}
        </nav>

        {backfilling && !mentions?.length ? (
          <div className="pr-list" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <div key={i} className="pr-mention"><div className="sk" style={{ width: 28, height: 28, borderRadius: 8 }} /><div style={{ display: 'grid', gap: 8 }}><div className="sk sk-line" style={{ width: '40%' }} /><div className="sk sk-line" /><div className="sk sk-line" style={{ width: '75%' }} /></div></div>)}
          </div>
        ) : mentions?.length ? (
          <div className="pr-list">
            {mentions.map((m) => {
              const src = SOURCE[m.source] ?? { name: m.source, icon: 'email' as const };
              const rough = m.relevance_score == null;
              const draftStatus = (m.assets as unknown as { status: string } | null)?.status;
              const tone = m.score >= 75 ? 'hi' : m.score >= cfg.threshold ? 'mid' : 'lo';
              return (
                <article key={m.id} className="pr-mention pr-fade-in">
                  <PlatformIcon name={src.icon} size={28} />
                  <div className="pr-mention-main">
                    <div className="pr-item-meta">
                      <span>{m.author ?? 'Someone'} on {src.name}</span>
                      {m.posted_at && <span>{ago(m.posted_at)}</span>}
                      {m.intent && <span className="pr-chip">{INTENT[m.intent] ?? m.intent}</span>}
                    </div>
                    {m.title && <h3 className="pr-mention-title">{m.title}</h3>}
                    <p className="pr-mention-text">{m.text}</p>
                    {m.reason && !rough && <p className="pr-mention-why">{m.reason}</p>}
                    <div className="pr-mention-act">
                      {m.draft_asset_id ? (
                        <Link className="pr-btn pr-btn-primary pr-btn-sm" href={`/app/${id}/inbox`}>{draftStatus === 'pending' ? 'Review reply' : 'See reply'}</Link>
                      ) : drafting.has(m.id) ? (
                        <button className="pr-btn pr-btn-sm" disabled aria-busy="true"><span className="spin" /> Drafting…</button>
                      ) : (
                        <form action={draftMention}><input type="hidden" name="ws" value={id} /><input type="hidden" name="mention" value={m.id} /><Submit className="pr-btn pr-btn-sm" pending="Starting…">{Icon.edit} Draft reply</Submit></form>
                      )}
                      <a className="pr-btn pr-btn-ghost pr-btn-sm" href={m.url} target="_blank" rel="noopener noreferrer">{Icon.external} Open</a>
                      <form action={setMentionStatus} style={{ marginLeft: 'auto' }}>
                        <input type="hidden" name="ws" value={id} /><input type="hidden" name="mention" value={m.id} />
                        {m.status === 'dismissed'
                          ? <Submit className="pr-btn pr-btn-ghost pr-btn-sm" name="status" value="new" pending="…">Restore</Submit>
                          : <Submit className="pr-btn pr-btn-ghost pr-btn-sm" name="status" value="dismissed" pending="…" title="Not relevant">{Icon.x} Dismiss</Submit>}
                      </form>
                    </div>
                  </div>
                  <div className={`pr-mscore pr-mscore-${tone}`} title={rough ? 'Rough score from wording. Not checked by AI yet.' : 'Relevance score from AI'}>
                    <b>{m.score}</b><span>{rough ? 'rough' : 'score'}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="pr-list"><div className="pr-empty">
            <h2>{f === 'best' ? 'Nothing worth a reply yet' : 'Nothing here'}</h2>
            <p>{f === 'best' ? `We'll keep checking every 20 minutes. Lower the score in Settings to see more, or try the searches on the right.` : 'Conversations show up here as we find them.'}</p>
          </div></div>
        )}
      </div>

      <aside className="pr-listen-side">
        <div className="pr-section">
          <div className="pr-section-h"><h2>Open today</h2><p>Reddit, Indie Hackers and X searches, opened in your own browser. With the <Link href={`/app/${id}/settings#extension`} className="pr-link">Chrome extension</Link>, we score Reddit posts and draft replies right there.</p></div>
          <div className="pr-section-b pr-links">
            {links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="pr-linkrow">
                <PlatformIcon name={l.icon} size={20} />
                <span><b>{l.label}</b><small>{l.where}</small></span>
                {Icon.external}
              </a>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
