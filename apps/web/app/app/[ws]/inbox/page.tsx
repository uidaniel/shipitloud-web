import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { addExampleDrafts, approveAll } from '../../actions';
import { Submit } from '@/components/app/ui';
import { InboxItem, UndoRow, type InboxAsset } from './item';

export const metadata: Metadata = { title: 'Inbox' };

const TABS = [
  { key: 'all', label: 'All', types: null },
  { key: 'replies', label: 'Replies', types: ['reply'] },
  { key: 'posts', label: 'Posts', types: ['post', 'article'] },
  { key: 'visuals', label: 'Visuals', types: ['poster', 'video', 'ad_creative'] },
  { key: 'emails', label: 'Emails', types: ['email'] },
] as const;

export default async function Inbox({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { ws: id } = await params;
  const { tab = 'all' } = await searchParams;
  const { sb, ws } = await requireWorkspace(id);

  const [pendingRes, undoRes] = await Promise.all([
    sb.from('assets').select('id, type, platform, title, content, confidence, flags, scheduled_for, expires_at, created_at')
      .eq('workspace_id', id).eq('status', 'pending').order('expires_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }),
    sb.from('assets').select('id, type, platform, title, undo_until').eq('workspace_id', id).eq('status', 'auto_approved').gt('undo_until', new Date().toISOString()),
  ]);
  const all = (pendingRes.data ?? []) as InboxAsset[];
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const items = active.types ? all.filter((a) => (active.types as readonly string[]).includes(a.type)) : all;
  const count = (types: readonly string[] | null) => (types ? all.filter((a) => types.includes(a.type)).length : all.length);
  // "Approve safe": confident, unflagged, own-channel items. Replies to other people always stay one by one.
  const safe = items.filter((a) => a.type !== 'reply' && !a.flags.length && (a.confidence ?? 0) >= ws.trust_threshold);

  return (
    <div className="pr-body">
      {ws.kill_switch && (
        <div className="pr-banner pr-banner-err">
          <span><b>Kill switch is on.</b> Nothing will post, send or spend until you turn it off.</span>
          <Link className="pr-btn pr-btn-sm" href={`/app/${id}/settings`}>Settings</Link>
        </div>
      )}
      {ws.trust_dropped_at && ws.trust_mode === 'manual' && (
        <div className="pr-banner pr-banner-warn">
          <span><b>Back to Manual.</b> {ws.trust_dropped_reason}</span>
          <Link className="pr-btn pr-btn-sm" href={`/app/${id}/settings`}>Review</Link>
        </div>
      )}

      {!!undoRes.data?.length && (
        <div className="pr-list" style={{ marginBottom: 18 }}>
          {undoRes.data.map((a) => <UndoRow key={a.id} ws={id} asset={a} />)}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <nav className="pr-tabs" aria-label="Filter">
          {TABS.map((t) => (
            <Link key={t.key} href={t.key === 'all' ? `/app/${id}/inbox` : `/app/${id}/inbox?tab=${t.key}`} aria-current={active.key === t.key ? 'page' : undefined}>
              {t.label} <span className="n">{count(t.types)}</span>
            </Link>
          ))}
        </nav>
        {safe.length > 1 && (
          <form action={approveAll} style={{ marginBottom: 14 }}>
            <input type="hidden" name="ws" value={id} />
            <input type="hidden" name="ids" value={safe.map((a) => a.id).join(',')} />
            <Submit className="pr-btn pr-btn-sm" pending="Approving…" title={`Approves ${safe.length} confident posts, emails and visuals. Replies stay one by one.`}>
              Approve {safe.length} safe items
            </Submit>
          </form>
        )}
      </div>

      {items.length ? (
        <div className="pr-list">
          {items.map((a) => <InboxItem key={a.id} ws={id} asset={a} threshold={ws.trust_threshold} />)}
        </div>
      ) : (
        <div className="pr-list">
          <div className="pr-empty pr-fade-in">
            <h2>{all.length ? 'Nothing here' : 'Nothing needs you'}</h2>
            <p>{all.length ? 'Try another tab.' : 'New drafts, replies and visuals land here for a quick yes or no. Nothing goes out without your OK.'}</p>
            {!all.length && process.env.NODE_ENV !== 'production' && (
              <form action={addExampleDrafts}>
                <input type="hidden" name="ws" value={id} />
                <Submit className="pr-btn" pending="Adding…">Add example drafts (test)</Submit>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
