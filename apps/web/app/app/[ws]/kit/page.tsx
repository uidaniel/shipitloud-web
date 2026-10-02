import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { Submit } from '@/components/app/ui';
import { makeLaunchKit, runReadinessCheck, setDirectory } from '../../actions';
import { PostersTab } from './posters-tab';
import { VideoTab } from './video-tab';
import { KitRefresher } from './refresher';

export const metadata: Metadata = { title: 'Launch kit' };

const TABS = [
  { key: 'posters', label: 'Posters' },
  { key: 'video', label: 'Demo video' },
  { key: 'posts', label: 'Launch posts' },
  { key: 'readiness', label: 'Readiness check' },
  { key: 'directories', label: 'Directories' },
] as const;

const ICON: Record<string, Platform> = { x: 'x', linkedin: 'linkedin', reddit: 'reddit', whatsapp: 'email', producthunt: 'hn' };
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Needs you', cls: 'pr-chip-warn' }, approved: { label: 'Approved', cls: 'pr-chip-ok' },
  auto_approved: { label: 'Auto-approved', cls: 'pr-chip-violet' }, scheduled: { label: 'Ready to post', cls: 'pr-chip-ok' },
  published: { label: 'Posted', cls: 'pr-chip-ok' }, expired: { label: 'Expired', cls: '' },
};

async function PostsTab({ id }: { id: string }) {
  const { sb } = await requireWorkspace(id);
  const [{ data: posts }, { data: running }, { data: brain }] = await Promise.all([
    sb.from('assets').select('id, title, platform, status, flags, scheduled_for, content').eq('workspace_id', id).eq('prompt_version', 'launch_posts@1').neq('status', 'rejected').order('scheduled_for'),
    sb.from('jobs').select('id').eq('workspace_id', id).eq('type', 'kit.launch').in('status', ['queued', 'running']).limit(1),
    sb.from('brand_brains').select('status').eq('workspace_id', id).maybeSingle(),
  ]);
  const busy = !!running?.length;
  return (
    <div>
      {busy && <KitRefresher />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Launch posts</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>X thread, LinkedIn, Reddit, Product Hunt and WhatsApp, in your voice. Plus your 30-day plan.</p>
        </div>
        {brain?.status === 'ready' && (
          <form action={makeLaunchKit}>
            <input type="hidden" name="ws" value={id} />
            <Submit className="pr-btn pr-btn-primary" pending="Starting…">{busy ? 'Writing…' : posts?.length ? 'Write a new set' : 'Write my launch posts'}</Submit>
          </form>
        )}
      </div>
      {busy && !posts?.length ? (
        <div className="pr-list" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="pr-item"><div className="sk" style={{ width: 24, height: 24 }} /><div style={{ display: 'grid', gap: 8 }}><div className="sk sk-title" /><div className="sk sk-line" style={{ width: '60%' }} /></div><div /></div>)}</div>
      ) : posts?.length ? (
        <div className="pr-list">
          {posts.map((p) => {
            const s = STATUS[p.status] ?? { label: p.status, cls: '' };
            return (
              <div key={p.id} className="pr-item" style={{ alignItems: 'center' }}>
                <div>{p.platform && ICON[p.platform] ? <PlatformIcon name={ICON[p.platform]!} size={22} /> : null}</div>
                <div className="pr-item-main">
                  <span className="pr-item-title">{p.title}</span>
                  <div className="pr-item-meta">
                    {p.scheduled_for && <span>{new Date(p.scheduled_for).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                    {p.flags?.map((f: string) => <span key={f} className="pr-chip pr-chip-err">{f}</span>)}
                  </div>
                </div>
                <div className="pr-item-act">
                  <span className={`pr-chip ${s.cls}`}>{s.label}</span>
                  {p.status === 'pending' && <Link className="pr-btn pr-btn-sm" href={`/app/${id}/inbox`}>Review</Link>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pr-list"><div className="pr-empty"><h2>No launch posts yet</h2><p>We&apos;ll draft one post per channel from your brand brain, scheduled around your launch date, and a 30-day plan to go with them.</p></div></div>
      )}
    </div>
  );
}

async function ReadinessTab({ id, url }: { id: string; url: string | null }) {
  const { sb } = await requireWorkspace(id);
  const [{ data: last }, { data: running }] = await Promise.all([
    sb.from('readiness_checks').select('score, results, checked_at, url').eq('workspace_id', id).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('jobs').select('id').eq('workspace_id', id).eq('type', 'kit.readiness').in('status', ['queued', 'running']).limit(1),
  ]);
  const busy = !!running?.length;
  const results = (last?.results ?? []) as { check: string; ok: boolean; detail: string; fix?: string }[];
  const fails = results.filter((r) => !r.ok);
  return (
    <div>
      {busy && <KitRefresher />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Launch readiness check</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Will your site hold up when people show up? HTTPS, previews, broken links, speed and more.</p>
        </div>
        {url ? (
          <form action={runReadinessCheck}>
            <input type="hidden" name="ws" value={id} />
            <Submit className="pr-btn pr-btn-primary" pending="Starting…">{busy ? 'Checking…' : last ? 'Check again' : 'Check my site'}</Submit>
          </form>
        ) : <Link className="pr-btn" href={`/app/${id}/settings`}>Add your site link</Link>}
      </div>
      {busy && !last && <div className="pr-section" style={{ padding: 20, display: 'grid', gap: 10 }} aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk sk-line" style={{ width: `${80 - i * 8}%` }} />)}</div>}
      {last && (
        <div className="pr-section">
          <div className="pr-section-h" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span className="pr-score-big" style={{ color: last.score >= 85 ? 'var(--ok)' : last.score >= 65 ? 'var(--warn)' : 'var(--err)' }}>{last.score}</span>
            <div>
              <h2>{last.score >= 85 ? 'Ready to launch' : last.score >= 65 ? 'Almost there' : 'Fix these before launch'}</h2>
              <p>{fails.length ? `${fails.length} thing${fails.length === 1 ? '' : 's'} to fix` : 'Everything passed'} · {new URL(last.url).hostname} · {new Date(last.checked_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
            </div>
          </div>
          <div className="pr-section-b pr-checks" style={{ gap: 0 }}>
            {[...fails, ...results.filter((r) => r.ok)].map((r) => (
              <div key={r.check}>
                <span className={r.ok ? 'pr-dot-ok' : 'pr-dot-bad'}>{r.ok ? '✓' : '!'}</span>
                <div>
                  <b>{r.check}</b>
                  <div className="d">{r.detail}</div>
                  {!r.ok && r.fix && <div className="f">{r.fix}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!last && !busy && <div className="pr-list"><div className="pr-empty"><h2>Not checked yet</h2><p>Takes about a minute. We only read your public pages.</p></div></div>}
    </div>
  );
}

async function DirectoriesTab({ id }: { id: string }) {
  const { sb } = await requireWorkspace(id);
  const [{ data: dirs }, { data: subs }] = await Promise.all([
    sb.from('directories').select('id, name, url, submit_url, category, notes').order('category').order('name'),
    sb.from('directory_submissions').select('directory_id, status').eq('workspace_id', id),
  ]);
  const st = new Map((subs ?? []).map((s) => [s.directory_id, s.status as string]));
  const live = [...st.values()].filter((s) => s === 'live').length;
  const submitted = [...st.values()].filter((s) => s === 'submitted' || s === 'live').length;
  const OPTIONS = [['todo', 'To do'], ['submitted', 'Submitted'], ['live', 'Live'], ['rejected', 'Rejected']] as const;
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Directories</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Places to list your product for early traffic and backlinks. {submitted} submitted · {live} live.</p>
      </div>
      <div className="pr-table-wrap">
        <table className="pr-table">
          <thead><tr><th>Directory</th><th className="hide-sm">Tip</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(dirs ?? []).map((d) => {
              const cur = st.get(d.id) ?? 'todo';
              return (
                <tr key={d.id}>
                  <td><span className="t-main">{d.name}</span><span className="t-sub">{d.category}</span></td>
                  <td className="hide-sm" style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 380 }}>{d.notes}</td>
                  <td>
                    <form action={setDirectory} style={{ display: 'flex', gap: 4 }}>
                      <input type="hidden" name="ws" value={id} />
                      <input type="hidden" name="dir" value={d.id} />
                      {OPTIONS.map(([v, l]) => (
                        <button key={v} name="status" value={v} className={`pr-chip ${cur === v ? (v === 'live' ? 'pr-chip-ok' : v === 'submitted' ? 'pr-chip-violet' : v === 'rejected' ? 'pr-chip-err' : '') : ''}`} style={{ border: 0, cursor: 'pointer', opacity: cur === v ? 1 : 0.45 }} aria-pressed={cur === v}>{l}</button>
                      ))}
                    </form>
                  </td>
                  <td style={{ textAlign: 'right' }}><a className="pr-btn pr-btn-sm" href={d.submit_url ?? d.url} target="_blank" rel="noopener noreferrer">Submit</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function Kit({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { ws: id } = await params;
  const { tab = 'posters' } = await searchParams;
  const { ws } = await requireWorkspace(id);
  const active = TABS.find((t) => t.key === tab)?.key ?? 'posters';
  return (
    <div className="pr-body">
      <nav className="pr-tabs" aria-label="Launch kit">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === 'posters' ? `/app/${id}/kit` : `/app/${id}/kit?tab=${t.key}`} aria-current={active === t.key ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>
      <div style={{ marginTop: 10 }}>
        {active === 'posters' && <PostersTab id={id} />}
        {active === 'video' && <VideoTab id={id} />}
        {active === 'posts' && <PostsTab id={id} />}
        {active === 'readiness' && <ReadinessTab id={id} url={ws.url} />}
        {active === 'directories' && <DirectoriesTab id={id} />}
      </div>
    </div>
  );
}
