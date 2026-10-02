import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { planWeek, repurposePost, setWeeklyPlan, writeFromFormat } from '../../actions';
import { KitRefresher } from '../kit/refresher';
import { ManualUpdateForm, SourcesForm, VoiceForm, WebhookForm } from './forms';

export const metadata: Metadata = { title: 'Content' };

const TABS = [{ key: 'week', label: 'This week' }, { key: 'library', label: 'Formats' }, { key: 'updates', label: 'Updates' }, { key: 'voice', label: 'Voice' }] as const;
const ICON: Record<string, Platform> = { x: 'x', linkedin: 'linkedin', whatsapp: 'email', instagram: 'instagram', tiktok: 'tiktok', reddit: 'reddit', hn: 'hn' };
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Needs you', cls: 'pr-chip-warn' }, approved: { label: 'Approved', cls: 'pr-chip-ok' }, auto_approved: { label: 'Auto-approved', cls: 'pr-chip-violet' },
  scheduled: { label: 'Ready to post', cls: 'pr-chip-ok' }, published: { label: 'Posted', cls: 'pr-chip-ok' }, failed: { label: 'Failed', cls: 'pr-chip-err' },
};
const KIND: Record<string, string> = { post: 'Posts', video: 'Short video', carousel: 'Carousels' };

interface Item { id: string; type: string; platform: string | null; title: string; status: string; scheduled_for: string | null; publish_score: number | null; file_url: string | null; content: { text?: string; ref?: string; score_tips?: string[]; format_slug?: string } }

function Week({ id, items, tz, busy }: { id: string; items: Item[]; tz: string; busy: boolean }) {
  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const dayLabel = (iso: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const groups = new Map<string, { label: string; items: Item[] }>();
  for (const it of items) {
    const k = it.scheduled_for ? dayKey(it.scheduled_for) : 'unscheduled';
    if (!groups.has(k)) groups.set(k, { label: it.scheduled_for ? dayLabel(it.scheduled_for) : 'Not scheduled', items: [] });
    groups.get(k)!.items.push(it);
  }
  if (busy && !items.length) {
    return <div className="pr-list" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="pr-item"><div className="sk" style={{ width: 24, height: 24 }} /><div style={{ display: 'grid', gap: 8 }}><div className="sk sk-title" /><div className="sk sk-line" style={{ width: '50%' }} /></div><div /></div>)}</div>;
  }
  if (!items.length) {
    return <div className="pr-list"><div className="pr-empty"><h2>Nothing planned yet</h2><p>Plan your week: five posts from your themes, what you shipped and what people asked about, scheduled for the mornings ahead.</p></div></div>;
  }
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {[...groups.entries()].map(([k, g]) => (
        <section key={k} className="pr-day">
          <h3>{g.label}</h3>
          <div className="pr-list">
            {g.items.map((it) => {
              const s = STATUS[it.status] ?? { label: it.status, cls: '' };
              const tips = it.content.score_tips ?? [];
              const canRepurpose = it.type === 'post' && (it.content.text?.length ?? 0) >= 40 && it.content.ref !== 'repurpose' && it.platform !== 'whatsapp';
              return (
                <div key={it.id} className="pr-item pr-fade-in" style={{ alignItems: 'center' }}>
                  <div>{it.platform && ICON[it.platform] ? <PlatformIcon name={ICON[it.platform]!} size={22} /> : null}</div>
                  <div className="pr-item-main">
                    <span className="pr-item-title">{it.title}</span>
                    <div className="pr-item-meta">
                      {it.scheduled_for && <span>{time(it.scheduled_for)}</span>}
                      {it.type === 'poster' && <span>Poster</span>}
                      {it.publish_score != null && <span className={`pr-pscore ${it.publish_score >= 85 ? 'hi' : it.publish_score >= 70 ? 'mid' : 'lo'}`} title={tips.join('\n') || 'Ready to post'}>Score {it.publish_score}</span>}
                      {tips[0] && <span className="pr-tip">{tips[0]}</span>}
                    </div>
                  </div>
                  <div className="pr-item-act">
                    <span className={`pr-chip ${s.cls}`}>{s.label}</span>
                    {it.status === 'pending' && <Link className="pr-btn pr-btn-sm" href={`/app/${id}/inbox`}>Review</Link>}
                    {canRepurpose && (
                      <form action={repurposePost}><input type="hidden" name="ws" value={id} /><input type="hidden" name="asset" value={it.id} /><Submit className="pr-btn pr-btn-ghost pr-btn-sm" pending="Starting…" title="Turn this into a thread, a LinkedIn post, a WhatsApp status and a poster">Repurpose</Submit></form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default async function Content({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { ws: id } = await params;
  const { tab = 'week' } = await searchParams;
  const active = TABS.find((t) => t.key === tab)?.key ?? 'week';
  const { sb, ws, user } = await requireWorkspace(id);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const until = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const [{ data: profile }, { data: src }, { data: jobs }, { data: cap }, { data: brain }] = await Promise.all([
    sb.from('profiles').select('timezone').eq('id', user.id).maybeSingle(),
    sb.from('content_sources').select('changelog_url, github_repo, weekly_plan, last_checked_at, last_planned_at').eq('workspace_id', id).maybeSingle(),
    sb.from('jobs').select('type').eq('workspace_id', id).like('type', 'content.%').in('status', ['queued', 'running']),
    sb.from('plan_limits').select('monthly_cap').eq('plan', ws.plan).eq('metric', 'ai_drafts').maybeSingle(),
    sb.from('brand_brains').select('status').eq('workspace_id', id).maybeSingle(),
  ]);
  const tz = profile?.timezone || 'UTC';
  const running = new Set((jobs ?? []).map((j) => j.type));
  const busy = running.size > 0;
  const allowed = (cap?.monthly_cap ?? 0) > 0;

  let body: React.ReactNode = null;
  if (active === 'week') {
    const [{ data: scheduled }, { data: loose }] = await Promise.all([
      sb.from('assets').select('id, type, platform, title, status, scheduled_for, publish_score, file_url, content').eq('workspace_id', id).in('type', ['post', 'poster', 'video'])
        .gte('scheduled_for', since).lte('scheduled_for', until).not('status', 'in', '(rejected,expired)').order('scheduled_for'),
      sb.from('assets').select('id, type, platform, title, status, scheduled_for, publish_score, file_url, content').eq('workspace_id', id).eq('type', 'post').is('scheduled_for', null).eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
    ]);
    body = <Week id={id} items={[...((scheduled ?? []) as Item[]), ...((loose ?? []) as Item[])]} tz={tz} busy={running.has('content.week')} />;
  } else if (active === 'library') {
    const { data: formats } = await sb.from('viral_formats').select('slug, kind, platforms, name, hook_pattern, example, why, needs').order('kind').order('name');
    const byKind = new Map<string, NonNullable<typeof formats>>();
    for (const f of formats ?? []) { if (!byKind.has(f.kind)) byKind.set(f.kind, []); byKind.get(f.kind)!.push(f); }
    body = (
      <div style={{ display: 'grid', gap: 22 }}>
        <p className="pr-lead" style={{ margin: 0 }}>Proven shapes for posts. Pick one and we write it for your product, in your voice. Formats that work for you rise to the top over time.</p>
        {['post', 'video', 'carousel'].filter((k) => byKind.has(k)).map((k) => (
          <section key={k} className="pr-day">
            <h3>{KIND[k]}{k !== 'post' && <span className="pr-chip" style={{ marginLeft: 8 }}>Coming with video remix</span>}</h3>
            <div className="pr-formats">
              {byKind.get(k)!.map((f) => (
                <article key={f.slug} className="pr-format">
                  <div className="pr-format-h"><b>{f.name}</b><span>{f.platforms.join(' · ')}</span></div>
                  <p className="pr-format-hook">{f.hook_pattern}</p>
                  <pre className="pr-format-ex">{f.example}</pre>
                  <p className="pr-format-why">{f.why}</p>
                  {f.needs && <span className="pr-chip pr-chip-warn" style={{ justifySelf: 'start' }}>Needs {f.needs}</span>}
                  {k === 'post' && (
                    <form action={writeFromFormat} className="pr-format-act">
                      <input type="hidden" name="ws" value={id} /><input type="hidden" name="slug" value={f.slug} />
                      {f.platforms.includes('x') && <Submit className="pr-btn pr-btn-sm" name="platform" value="x" pending="Writing…">Write for X</Submit>}
                      {f.platforms.includes('linkedin') && <Submit className="pr-btn pr-btn-sm" name="platform" value="linkedin" pending="Writing…">Write for LinkedIn</Submit>}
                    </form>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  } else if (active === 'updates') {
    const { data: updates } = await sb.from('product_updates').select('id, source, title, url, published_at, used_at, created_at').eq('workspace_id', id).order('created_at', { ascending: false }).limit(20);
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const origin = host ? `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}` : '';
    const SRC: Record<string, string> = { github_release: 'GitHub release', github_push: 'GitHub push', changelog: 'Changelog', manual: 'You' };
    body = (
      <div style={{ display: 'grid', gap: 18, maxWidth: 820 }}>
        <ManualUpdateForm ws={id} />
        {!!updates?.length && (
          <div className="pr-section">
            <div className="pr-section-h"><h2>Recent updates</h2><p>{src?.last_checked_at ? `Last checked ${new Date(src.last_checked_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not checked yet'}</p></div>
            <div className="pr-list" style={{ margin: 0, border: 0 }}>
              {updates.map((u) => (
                <div key={u.id} className="pr-item" style={{ alignItems: 'center' }}>
                  <div>{Icon.check}</div>
                  <div className="pr-item-main"><span className="pr-item-title">{u.url ? <a href={u.url} target="_blank" rel="noopener noreferrer" className="pr-link">{u.title}</a> : u.title}</span><div className="pr-item-meta"><span>{SRC[u.source] ?? u.source}</span><span>{new Date(u.published_at ?? u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div></div>
                  <div className="pr-item-act"><span className={`pr-chip ${u.used_at ? 'pr-chip-ok' : ''}`}>{u.used_at ? 'Posts drafted' : running.has('content.update_posts') ? 'Drafting…' : 'Waiting'}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
        <SourcesForm ws={id} feed={src?.changelog_url ?? ''} repo={src?.github_repo ?? ''} weekly={!!src?.weekly_plan} />
        <WebhookForm ws={id} url={`${origin}/api/hooks/github/${id}`} />
      </div>
    );
  } else {
    const { data: voice } = await sb.from('voice_profiles').select('tone, style_notes, dos, donts, sample_posts, updated_at').eq('workspace_id', id).maybeSingle();
    body = (
      <div style={{ display: 'grid', gap: 18, maxWidth: 820 }}>
        <div className="pr-section" aria-busy={running.has('content.voice') || undefined}>
          <div className="pr-section-h"><h2>How you write</h2><p>{running.has('content.voice') ? 'Reading your posts…' : 'Every draft follows this. Edit it on the Brand page.'}</p></div>
          <div className="pr-section-b pr-voice">
            {running.has('content.voice') ? <><div className="sk sk-title" /><div className="sk sk-line" /><div className="sk sk-line" style={{ width: '70%' }} /></> : (
              <>
                <div><span>Tone</span><b>{voice?.tone ?? 'Not learned yet'}</b></div>
                {voice?.style_notes && <div><span>Style</span><p>{voice.style_notes}</p></div>}
                {!!voice?.dos?.length && <div><span>Keeps doing</span><ul>{voice.dos.map((d: string) => <li key={d}>{d}</li>)}</ul></div>}
                {!!voice?.donts?.length && <div><span>Never does</span><ul>{voice.donts.map((d: string) => <li key={d}>{d}</li>)}</ul></div>}
              </>
            )}
          </div>
        </div>
        <VoiceForm ws={id} samples={voice?.sample_posts ?? []} />
      </div>
    );
  }

  return (
    <div className="pr-body">
      {busy && <KitRefresher />}
      <div className="pr-content-head">
        <div>
          <h1 className="pr-h1">Content</h1>
          <p className="pr-lead">Posts from what you ship, what people ask and the formats that work, in your voice.</p>
        </div>
        {brain?.status === 'ready' && allowed ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <form action={setWeeklyPlan}>
              <input type="hidden" name="ws" value={id} /><input type="hidden" name="on" value={src?.weekly_plan ? 'false' : 'true'} />
              <Submit className={`pr-btn pr-btn-ghost pr-btn-sm ${src?.weekly_plan ? 'is-on' : ''}`} pending="Saving…" title="Plan next week every Sunday">{src?.weekly_plan ? '● Autopilot on' : '○ Autopilot off'}</Submit>
            </form>
            <form action={planWeek}><input type="hidden" name="ws" value={id} /><Submit className="pr-btn pr-btn-primary" pending="Starting…" disabled={running.has('content.week')}>{running.has('content.week') ? 'Planning…' : 'Plan my week'}</Submit></form>
          </div>
        ) : brain?.status !== 'ready' ? <Link className="pr-btn pr-btn-primary" href={`/app/setup/${id}`}>Set up your brand first</Link> : <Link className="pr-btn pr-btn-primary" href="/pricing">See plans</Link>}
      </div>
      {busy && (
        <div className="pr-banner pr-banner-info pr-fade-in" role="status" style={{ marginTop: 14 }}>
          <span><span className="spin" style={{ verticalAlign: '-2px', marginRight: 8 }} />{running.has('content.week') ? 'Planning your week. About a minute.' : running.has('content.repurpose') ? 'Repurposing into a thread, LinkedIn post, status and poster…' : running.has('content.voice') ? 'Learning your voice…' : 'Writing…'}</span>
        </div>
      )}
      <nav className="pr-tabs" aria-label="Content" style={{ marginTop: 14 }}>
        {TABS.map((t) => <Link key={t.key} href={t.key === 'week' ? `/app/${id}/content` : `/app/${id}/content?tab=${t.key}`} aria-current={active === t.key ? 'page' : undefined}>{t.label}</Link>)}
      </nav>
      <div style={{ marginTop: 14 }}>{body}</div>
    </div>
  );
}
