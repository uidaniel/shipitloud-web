import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { site } from '@/lib/site';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { deleteShortLink, makeDigestNow } from '../../actions';
import { KitRefresher } from '../kit/refresher';
import { CopyButton, LinkForm } from './parts';

export const metadata: Metadata = { title: 'Momentum' };

interface Day { day: string; conversations: number; replies: number; posts: number; clicks: number; signups: number }
type Key = 'conversations' | 'replies' | 'posts' | 'clicks' | 'signups';
const STATS: { key: Key; label: string; hint: string }[] = [
  { key: 'conversations', label: 'Conversations found', hint: 'People talking about the problem you solve' },
  { key: 'replies', label: 'Replies posted', hint: 'Helpful replies you sent' },
  { key: 'posts', label: 'Posts published', hint: 'Posts, visuals, videos and articles' },
  { key: 'clicks', label: 'Clicks', hint: 'On your tracked links (people, not previews)' },
  { key: 'signups', label: 'Signups', hint: 'Waitlist plus signups the snippet saw' },
];
const ICON: Record<string, Platform> = { x: 'x', linkedin: 'linkedin', reddit: 'reddit', hn: 'hn', instagram: 'instagram', tiktok: 'tiktok', email: 'email', whatsapp: 'email', bluesky: 'bluesky', github: 'github', referral: 'referral', blog: 'rss', producthunt: 'producthunt' };

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${28 - (v / max) * 26}`).join(' ');
  return <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="pr-spark" aria-hidden="true"><polyline points={pts} fill="none" vectorEffect="non-scaling-stroke" /></svg>;
}

function Chart({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.signups, d.clicks)));
  const w = 100 / days.length;
  const line = days.map((d, i) => `${i * w + w / 2},${100 - (d.clicks / max) * 92}`).join(' ');
  return (
    <figure className="pr-chart" aria-label="Signups and clicks per day, last 30 days">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {days.map((d, i) => d.signups > 0 && <rect key={d.day} x={i * w + w * 0.18} width={w * 0.64} y={100 - (d.signups / max) * 92} height={(d.signups / max) * 92} rx="0.6" className="bar"><title>{`${d.day}: ${d.signups} signups, ${d.clicks} clicks`}</title></rect>)}
        <polyline points={line} className="line" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption><span className="k bar" /> Signups <span className="k line" /> Clicks <span style={{ marginLeft: 'auto' }}>{new Date(days[0]!.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – today</span></figcaption>
    </figure>
  );
}

interface DigestRow { id: string; kind: 'weekly' | 'first_week'; period_start: string; period_end: string; summary: string; worked: string[]; actions: { title: string; why: string; href: string }[]; created_at: string }
const range = (a: string, b: string) => {
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${f(a)} – ${f(b)}`;
};

function Digest({ ws, digests, writing }: { ws: string; digests: DigestRow[]; writing: boolean }) {
  const [d, ...older] = digests;
  return (
    <section className="pr-section" id="digest">
      {writing && <KitRefresher />}
      <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h2>{d ? (d.kind === 'first_week' ? 'Your first 7 days' : 'Your week') : 'Your weekly digest'}</h2>
          <p>{d ? range(d.period_start, d.period_end) : 'Every Monday morning: what happened, what worked, and the next three things to do.'}</p>
        </div>
        <form action={makeDigestNow}><input type="hidden" name="ws" value={ws} /><Submit className="pr-btn pr-btn-sm" pending="Starting…" disabled={writing}>{writing ? <><span className="spin" /> Writing…</> : d ? 'Update now' : 'Write it now'}</Submit></form>
      </div>
      <div className="pr-section-b">
        {writing && !d ? (
          <div style={{ display: 'grid', gap: 10 }} aria-busy="true"><div className="sk sk-line" /><div className="sk sk-line" style={{ width: '80%' }} /><div className="sk sk-block" style={{ marginTop: 6 }} /></div>
        ) : d ? (
          <div className="pr-digest pr-fade-in">
            <p className="pr-digest-sum">{d.summary}</p>
            {d.worked.length > 0 && (
              <div><h3>What worked</h3><ul>{d.worked.map((w) => <li key={w}>{w}</li>)}</ul></div>
            )}
            {d.actions.length > 0 && (
              <div>
                <h3>Next {d.actions.length === 1 ? 'step' : `${d.actions.length} steps`}</h3>
                <ol className="pr-digest-acts">
                  {d.actions.map((a, i) => (
                    <li key={a.title}><Link href={a.href.replace(/^https?:\/\/[^/]+/, '')}><span className="n">{i + 1}</span><span><b>{a.title}</b><small>{a.why}</small></span>{Icon.arrow}</Link></li>
                  ))}
                </ol>
              </div>
            )}
            {older.length > 0 && (
              <details className="pr-more">
                <summary>Earlier weeks</summary>
                <div className="pr-digest-old">
                  {older.map((o) => <div key={o.id}><b>{o.kind === 'first_week' ? 'First 7 days' : range(o.period_start, o.period_end)}</b><p>{o.summary}</p></div>)}
                </div>
              </details>
            )}
          </div>
        ) : (
          <p className="pr-hint" style={{ margin: 0 }}>Your first one arrives after your first 7 days. You don’t have to wait: write one now from what’s happened so far.</p>
        )}
      </div>
    </section>
  );
}

export default async function Momentum({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, ws } = await requireWorkspace(id);
  const [{ data: daily }, { data: channels }, { data: links }, { data: key }, { data: lastSeen }, { count: highIntent }, { data: digests }, { data: digestJobs }] = await Promise.all([
    sb.rpc('momentum_daily', { p_ws: id, p_days: 60 }),
    sb.rpc('momentum_channels', { p_ws: id, p_days: 30 }),
    sb.from('short_links').select('id, code, target_url, source, campaign, clicks, last_clicked_at, asset_id').eq('workspace_id', id).order('clicks', { ascending: false }).order('created_at', { ascending: false }).limit(15),
    sb.from('workspaces').select('tracking_key').eq('id', id).single(),
    sb.from('track_events').select('created_at, path').eq('workspace_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('mentions').select('id', { count: 'exact', head: true }).eq('workspace_id', id).gte('score', 70).gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
    sb.from('digests').select('id, kind, period_start, period_end, summary, worked, actions, created_at').eq('workspace_id', id).order('period_end', { ascending: false }).order('created_at', { ascending: false }).limit(6),
    sb.from('jobs').select('id').eq('workspace_id', id).eq('type', 'digest.build').in('status', ['queued', 'running']).limit(1),
  ]);
  const writing = (digestJobs?.length ?? 0) > 0;
  const all = (daily ?? []) as Day[];
  const now = all.slice(-30);
  const before = all.slice(0, Math.max(0, all.length - 30));
  const sum = (rows: Day[], k: Key) => rows.reduce((n, d) => n + d[k], 0);
  const snippet = `<script src="${site.url}/t.js" data-key="${key?.tracking_key ?? ''}" defer></script>`;
  const nothing = STATS.every((s) => sum(now, s.key) === 0);

  return (
    <div className="pr-body" style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 className="pr-h1">Momentum</h1>
        <p className="pr-lead">What ShipItLoud found and did for {ws.product_name} in the last 30 days, and what came back.</p>
      </div>

      <div className="pr-stats">
        {STATS.map((s) => {
          const n = sum(now, s.key);
          const p = sum(before, s.key);
          const delta = p ? Math.round(((n - p) / p) * 100) : null;
          return (
            <div key={s.key} className="pr-stat" title={s.hint}>
              <span>{s.label}</span>
              <b>{n.toLocaleString('en-US')}</b>
              <Spark values={now.map((d) => d[s.key])} />
              <small className={delta == null ? '' : delta >= 0 ? 'up' : 'down'}>{delta == null ? (n ? 'New this month' : '–') : `${delta >= 0 ? '+' : ''}${delta}% vs previous 30 days`}</small>
            </div>
          );
        })}
      </div>

      {now.length > 0 && !nothing && <div className="pr-section"><div className="pr-section-b"><Chart days={now} /></div></div>}
      {nothing && (
        <div className="pr-list"><div className="pr-empty"><h2>Your momentum starts here</h2><p>Turn on Listening, plan a week of posts, and add the snippet below to your site. Replies and your own network usually bring the first signups in week one; content builds over weeks two to six.</p></div></div>
      )}

      <Digest ws={id} digests={(digests ?? []) as DigestRow[]} writing={writing} />

      <div className="pr-grid-2" style={{ alignItems: 'start' }}>
        <section className="pr-section">
          <div className="pr-section-h"><h2>By channel</h2><p>Last 30 days. Signups are credited to where the visitor first came from.</p></div>
          {channels?.length ? (
            <div className="pr-table-wrap"><table className="pr-table pr-table-tight">
              <thead><tr><th>Channel</th><th>Clicks</th><th>Signups</th><th className="hide-sm">Posts</th><th className="hide-sm">Clicks → signup</th></tr></thead>
              <tbody>
                {(channels as { channel: string; clicks: number; signups: number; posts: number }[]).map((c) => (
                  <tr key={c.channel}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{ICON[c.channel] ? <PlatformIcon name={ICON[c.channel]!} size={18} /> : <span className="pr-dotc" />}{c.channel}</span></td>
                    <td>{c.clicks}</td><td><b>{c.signups}</b></td><td className="hide-sm">{c.posts}</td>
                    <td className="hide-sm">{c.clicks ? `${Math.round((Math.min(c.signups, c.clicks) / c.clicks) * 100)}%` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <div className="pr-section-b"><p className="pr-hint" style={{ margin: 0 }}>Nothing yet. Channels show up as soon as people click or sign up.</p></div>}
        </section>

        <section className="pr-section">
          <div className="pr-section-h"><h2>Our promise</h2><p>At least 25 high-intent conversations in your first 30 days, or your next month is free.</p></div>
          <div className="pr-section-b" style={{ display: 'grid', gap: 10 }}>
            <div className="pr-progress" role="progressbar" aria-valuemin={0} aria-valuemax={25} aria-valuenow={Math.min(25, highIntent ?? 0)}><i style={{ width: `${Math.min(100, ((highIntent ?? 0) / 25) * 100)}%` }} /></div>
            <p style={{ margin: 0, fontSize: 14 }}><b>{highIntent ?? 0}</b> of 25 high-intent conversations in the last 30 days.</p>
            <Link className="pr-link" href={`/app/${id}/listening`} style={{ fontSize: 13 }}>See them in Listening</Link>
          </div>
        </section>
      </div>

      <section className="pr-section" id="snippet">
        <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><h2>Count signups on your site</h2><p>Add this once, before the closing &lt;/head&gt; tag. No cookies, nothing personal.</p></div>
          <span className={`pr-chip ${lastSeen ? 'pr-chip-ok' : ''}`}>{lastSeen ? `Working · last seen ${new Date(lastSeen.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not seen yet'}</span>
        </div>
        <div className="pr-section-b" style={{ display: 'grid', gap: 12 }}>
          <div className="pr-token"><code>{snippet}</code><CopyButton text={snippet} /></div>
          <p className="pr-hint" style={{ margin: 0 }}>Then count a signup either way: add <code className="pr-code">data-shipitloud=&quot;signup&quot;</code> to your signup form, or call <code className="pr-code">shipitloud(&apos;signup&apos;)</code> after someone signs up.</p>
        </div>
      </section>

      <div className="pr-grid-2" style={{ alignItems: 'start' }}>
        <section className="pr-section">
          <div className="pr-section-h"><h2>Tracked links</h2><p>Most clicked first.</p></div>
          {links?.length ? (
            <div className="pr-list" style={{ margin: 0, border: 0, borderRadius: 0 }}>
              {links.map((l) => (
                <div key={l.id} className="pr-item" style={{ alignItems: 'center' }}>
                  <span className="pr-prio">{l.clicks}</span>
                  <div className="pr-item-main">
                    <span className="pr-item-title" style={{ fontSize: 13 }}>{site.url.replace(/^https?:\/\//, '')}/l/{l.code}</span>
                    <div className="pr-item-meta"><span>{l.source}{l.campaign ? ` · ${l.campaign}` : ''}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>→ {l.target_url.replace(/^https?:\/\//, '')}</span>{l.asset_id && <span>from a post</span>}</div>
                  </div>
                  <div className="pr-item-act">
                    <CopyButton text={`${site.url}/l/${l.code}`} />
                    {!l.asset_id && <form action={deleteShortLink}><input type="hidden" name="ws" value={id} /><input type="hidden" name="id" value={l.id} /><Submit className="pr-btn pr-btn-ghost pr-btn-sm" pending="…" title="Delete">{Icon.x}</Submit></form>}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="pr-section-b"><p className="pr-hint" style={{ margin: 0 }}>Links appear here when posts go out, or when you make one.</p></div>}
        </section>
        <LinkForm ws={id} defaultTarget={ws.url ?? ''} />
      </div>
    </div>
  );
}
