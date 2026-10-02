import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { makePosters } from '../../actions';
import { KitRefresher } from './refresher';

export const metadata: Metadata = { title: 'Launch kit' };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Needs you', cls: 'pr-chip-warn' },
  approved: { label: 'Approved', cls: 'pr-chip-ok' },
  auto_approved: { label: 'Auto-approved', cls: 'pr-chip-violet' },
  scheduled: { label: 'Ready to post', cls: 'pr-chip-ok' },
  published: { label: 'Posted', cls: 'pr-chip-ok' },
  rejected: { label: 'Rejected', cls: '' },
};

export default async function Kit({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb } = await requireWorkspace(id);
  const [{ data: brain }, { data: posters }, { data: running }] = await Promise.all([
    sb.from('brand_brains').select('status').eq('workspace_id', id).maybeSingle(),
    sb.from('assets').select('id, title, file_url, status, qa_score, created_at').eq('workspace_id', id).eq('type', 'poster').neq('status', 'rejected').order('created_at', { ascending: false }),
    sb.from('jobs').select('id').eq('workspace_id', id).eq('type', 'kit.posters').in('status', ['queued', 'running']).limit(1),
  ]);
  const busy = !!running?.length;
  const brandReady = brain?.status === 'ready';

  return (
    <div className="pr-body">
      {busy && <KitRefresher />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Posters</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Your logo and colors in designer layouts. We write the words, you approve.</p>
        </div>
        {brandReady ? (
          <form action={makePosters}>
            <input type="hidden" name="ws" value={id} />
            <Submit className="pr-btn pr-btn-primary" pending="Starting…">{busy ? 'Making posters…' : posters?.length ? 'Make a new set' : 'Make posters'}</Submit>
          </form>
        ) : (
          <Link className="pr-btn pr-btn-primary" href={`/app/setup/${id}`}>Set up your brand first</Link>
        )}
      </div>

      {busy && (
        <div className="pr-gallery" aria-busy="true" style={{ marginBottom: 16 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="pr-card"><div className="sk" style={{ aspectRatio: '4 / 5', borderRadius: 0 }} /><div className="pr-card-b"><div className="sk sk-line" style={{ width: '70%' }} /></div></div>
          ))}
        </div>
      )}

      {posters?.length ? (
        <div className="pr-gallery">
          {posters.map((p) => {
            const s = STATUS[p.status] ?? { label: p.status, cls: '' };
            return (
              <div key={p.id} className="pr-card pr-fade-in">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={p.file_url ?? '#'} target="_blank" rel="noopener noreferrer"><img src={p.file_url ?? ''} alt={p.title} loading="lazy" /></a>
                <div className="pr-card-b">
                  <b>{p.title}</b>
                  <div className="pr-card-r">
                    <span className={`pr-chip ${s.cls}`}>{s.label}</span>
                    {p.file_url && <a className="pr-btn pr-btn-ghost pr-btn-sm" href={`${p.file_url}?download=${encodeURIComponent(p.title)}.png`}>Download</a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : !busy ? (
        <div className="pr-list"><div className="pr-empty">
          <h2>No posters yet</h2>
          <p>We&apos;ll make a launch set: announcement, feature, countdown, before/after, how it works and a sign-up push.</p>
        </div></div>
      ) : null}
    </div>
  );
}
