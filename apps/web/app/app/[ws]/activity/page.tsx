import type { Metadata } from 'next';
import { requireWorkspace } from '@/lib/supabase/server';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { ReadyToPost } from './ready';

export const metadata: Metadata = { title: 'Activity' };

const ICONS = new Set(['x', 'linkedin', 'reddit', 'hn', 'instagram', 'tiktok', 'email']);
const STATUS: Record<string, { label: string; cls: string }> = {
  executed: { label: 'Posted', cls: 'pr-chip-ok' },
  simulated: { label: 'Test mode', cls: 'pr-chip-violet' },
  copy_and_post: { label: 'Ready for you', cls: 'pr-chip-warn' },
  blocked: { label: 'Blocked', cls: 'pr-chip-err' },
  failed: { label: 'Failed', cls: 'pr-chip-err' },
  approved: { label: 'Approved', cls: 'pr-chip-ok' },
  edited: { label: 'Edited + approved', cls: 'pr-chip-ok' },
  auto_approved: { label: 'Auto-approved', cls: 'pr-chip-violet' },
  rejected: { label: 'Rejected', cls: '' },
  undone: { label: 'Undone', cls: '' },
};

function time(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function Activity({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb } = await requireWorkspace(id);

  const [actions, approvals, ready] = await Promise.all([
    sb.from('actions').select('id, kind, provider, status, reason, created_at, asset_id, assets(title)').eq('workspace_id', id).order('created_at', { ascending: false }).limit(60),
    sb.from('approvals').select('id, status, channel, note, decided_at, assets(title, platform)').eq('workspace_id', id).order('decided_at', { ascending: false }).limit(60),
    sb.from('assets').select('id, type, title, platform, content, file_url, actions(result)').eq('workspace_id', id).eq('status', 'scheduled').order('updated_at', { ascending: false }),
  ]);

  type Row = { key: string; at: string; title: string; platform: string | null; what: string; status: string; note: string | null };
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  const rows: Row[] = [
    ...(actions.data ?? []).map((a) => ({
      key: `a${a.id}`, at: a.created_at, title: one(a.assets as unknown as { title: string } | null)?.title ?? `${a.kind} on ${a.provider}`,
      platform: a.provider, what: a.kind === 'send' ? 'Send' : a.kind === 'spend' ? 'Spend' : 'Post', status: a.status, note: a.status === 'blocked' || a.status === 'failed' ? a.reason : null,
    })),
    ...(approvals.data ?? []).map((a) => {
      const asset = one(a.assets as unknown as { title: string; platform: string | null } | null);
      return { key: `p${a.id}`, at: a.decided_at, title: asset?.title ?? 'Item', platform: asset?.platform ?? null, what: a.channel === 'system' ? 'Trust mode' : 'You', status: a.status, note: a.channel === 'system' ? a.note : null };
    }),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const readyItems = (ready.data ?? []).map((a) => {
    const result = one(a.actions as unknown as { result: { copyAndPost?: { text: string; openUrl: string } } }[] | null)?.result;
    const c = a.content as { text?: string; kind?: string; slides?: string[]; platforms?: string[] };
    // Videos and carousels are posted by hand until the platforms' APIs are approved: give the files to download.
    const files = c.kind === 'carousel' && c.slides?.length ? c.slides.map((url, i) => ({ label: `Slide ${i + 1}`, url }))
      : a.file_url && (a.type === 'video' || a.type === 'poster') ? [{ label: a.type === 'video' ? 'Video' : 'Image', url: a.file_url }] : [];
    const also = (c.platforms ?? []).filter((x) => x !== a.platform);
    return { id: a.id, title: a.title, platform: a.platform, text: result?.copyAndPost?.text ?? c.text ?? '', openUrl: result?.copyAndPost?.openUrl ?? null, files, also };
  });

  return (
    <div className="pr-body">
      <div className="pr-page-h"><h1 className="pr-h1">Activity</h1><p className="pr-lead">Everything that went out, and what’s ready for you to post.</p></div>
      {!!readyItems.length && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Ready for you to post</h2>
          <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>These platforms haven&apos;t approved automatic posting yet. Copy, open, post, done.</p>
          <div className="pr-list">{readyItems.map((r) => <ReadyToPost key={r.id} ws={id} item={r} />)}</div>
        </section>
      )}

      <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Everything that happened</h2>
      {rows.length ? (
        <div className="pr-table-wrap">
          <table className="pr-table">
            <thead><tr><th>Item</th><th>By</th><th>Result</th><th>When</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS[r.status] ?? { label: r.status, cls: '' };
                return (
                  <tr key={r.key}>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {r.platform && ICONS.has(r.platform) && <PlatformIcon name={r.platform as Platform} size={20} />}
                        <span><span className="t-main">{r.title}</span>{r.note && <span className="t-sub">{r.note}</span>}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{r.what}</td>
                    <td><span className={`pr-chip ${s.cls}`}>{s.label}</span></td>
                    <td className="t-time">{time(r.at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="pr-list"><div className="pr-empty"><h2>No activity yet</h2><p>Every approval, post, send and spend is recorded here, so you can always see what happened and why.</p></div></div>
      )}
    </div>
  );
}
