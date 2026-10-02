import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { makeLaunchKit, toggleTask } from '../../actions';
import { KitRefresher } from '../kit/refresher';

export const metadata: Metadata = { title: 'Launch plan' };

interface Task { id: string; day: number; title: string; why: string; channel: string; asset_ref: string; asset_id: string | null; done: boolean }

const CHANNEL: Record<string, string> = {
  x: 'X', linkedin: 'LinkedIn', reddit: 'Reddit', product_hunt: 'Product Hunt', whatsapp: 'WhatsApp', email: 'Email',
  hn: 'Hacker News', indiehackers: 'Indie Hackers', directories: 'Directories', site: 'Your site', other: 'Other',
};
const REF_LINK: Record<string, string> = { posters: 'kit', waitlist_page: 'waitlist', readiness: 'kit?tab=readiness', directories: 'kit?tab=directories' };

function dateFor(launch: string, day: number) {
  const d = new Date(`${launch}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default async function Plan({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb } = await requireWorkspace(id);
  const [{ data: plan }, { data: brain }, { data: running }] = await Promise.all([
    sb.from('launch_plans').select('launch_date, tasks, status, error').eq('workspace_id', id).maybeSingle(),
    sb.from('brand_brains').select('status').eq('workspace_id', id).maybeSingle(),
    sb.from('jobs').select('id').eq('workspace_id', id).in('type', ['kit.launch', 'kit.plan']).in('status', ['queued', 'running']).limit(1),
  ]);
  const busy = !!running?.length || plan?.status === 'building';
  const tasks = (plan?.tasks ?? []) as Task[];
  const today = Math.floor((Date.now() - Date.parse(`${plan?.launch_date ?? '2000-01-01'}T00:00:00Z`)) / 86_400_000);
  const done = tasks.filter((t) => t.done).length;
  const groups = [
    { name: 'Before launch', items: tasks.filter((t) => t.day < 0) },
    { name: 'Launch day', items: tasks.filter((t) => t.day === 0) },
    { name: 'After launch', items: tasks.filter((t) => t.day > 0) },
  ].filter((g) => g.items.length);

  if (!tasks.length) {
    return (
      <div className="pr-body" style={{ maxWidth: 860 }}>
        {busy && <KitRefresher />}
        <div className="pr-list"><div className="pr-empty">
          {busy ? (
            <>
              <span className="spin" style={{ color: 'var(--violet-soft)', margin: '0 auto 14px', display: 'block' }} />
              <h2>Writing your launch posts and plan</h2>
              <p>This takes about a minute. Posts land in your inbox for approval.</p>
            </>
          ) : (
            <>
              <h2>{plan?.status === 'failed' ? 'We couldn’t make your plan' : 'Your 30-day launch plan'}</h2>
              <p>{plan?.error ?? 'Small daily tasks from two weeks before launch to two weeks after, each linked to the post or asset that does it. Set your launch date in Settings first for exact days.'}</p>
              {brain?.status === 'ready' ? (
                <form action={makeLaunchKit}><input type="hidden" name="ws" value={id} /><Submit pending="Starting…">Write my launch posts and plan</Submit></form>
              ) : (
                <Link className="pr-btn pr-btn-primary" href={`/app/setup/${id}`}>Set up your brand first</Link>
              )}
            </>
          )}
        </div></div>
      </div>
    );
  }

  return (
    <div className="pr-body" style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Launch on {dateFor(plan!.launch_date, 0)}</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>{done} of {tasks.length} done{today < 0 ? ` · ${-today} days to go` : today === 0 ? ' · launch day' : ` · day ${today} after launch`}</p>
        </div>
        <div className="pr-meter-bar" style={{ width: 200, height: 6 }}><i style={{ width: `${(done / tasks.length) * 100}%` }} /></div>
      </div>
      {groups.map((g) => (
        <section key={g.name} style={{ marginBottom: 22 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--faint)', fontWeight: 500 }}>{g.name}</h3>
          <div className="pr-list">
            {g.items.map((t) => {
              const href = t.asset_id ? `/app/${id}/inbox` : REF_LINK[t.asset_ref] ? `/app/${id}/${REF_LINK[t.asset_ref]}` : null;
              const isToday = t.day === today;
              return (
                <div key={t.id} className="pr-item" style={{ gridTemplateColumns: '28px 1fr auto', alignItems: 'center', background: isToday ? 'rgba(91,61,245,.07)' : undefined }}>
                  <form action={toggleTask}>
                    <input type="hidden" name="ws" value={id} />
                    <input type="hidden" name="task" value={t.id} />
                    <button className="pr-check" aria-pressed={t.done} aria-label={t.done ? 'Mark not done' : 'Mark done'}>{t.done ? '✓' : ''}</button>
                  </form>
                  <div className="pr-item-main" style={{ opacity: t.done ? 0.55 : 1 }}>
                    <span className="pr-item-title" style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
                    <div className="pr-item-meta">
                      <span>{dateFor(plan!.launch_date, t.day)}{isToday ? ' · Today' : ''}</span>
                      <span>· {CHANNEL[t.channel] ?? t.channel}</span>
                      <span>· {t.why}</span>
                    </div>
                  </div>
                  {href && !t.done && <Link className="pr-btn pr-btn-sm" href={href}>{t.asset_id ? 'Review draft' : 'Open'}</Link>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
