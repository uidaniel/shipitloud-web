import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { draftLaunchEmail, draftNetworkMessages } from '../../actions';
import { KitRefresher } from './refresher';
import { NetworkMessages, type Kind } from './network-messages';

export async function NetworkTab({ id }: { id: string }) {
  const { sb } = await requireWorkspace(id);
  const [{ data: kit }, { data: running }, { data: page }, { data: mail }, { count: people }] = await Promise.all([
    sb.from('network_kits').select('messages, links, sent, updated_at').eq('workspace_id', id).maybeSingle(),
    sb.from('jobs').select('type').eq('workspace_id', id).in('type', ['kit.network', 'email.draft_broadcast']).in('status', ['queued', 'running']),
    sb.from('waitlist_pages').select('id').eq('workspace_id', id).not('published_at', 'is', null).limit(1).maybeSingle(),
    sb.from('assets').select('id, status').eq('workspace_id', id).eq('type', 'email').eq('content->>kind', 'broadcast').ilike('content->>topic', 'We just launched%').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('waitlist_signups').select('id', { count: 'exact', head: true }).eq('workspace_id', id).is('unsubscribed_at', null),
  ]);
  const drafting = running?.some((j) => j.type === 'kit.network') ?? false;
  const mailing = running?.some((j) => j.type === 'email.draft_broadcast') ?? false;
  const msgs = (kit?.messages ?? {}) as Partial<Record<Kind, string>> & { flags?: Partial<Record<Kind, string[]>> };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {(drafting || mailing) && <KitRefresher />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Tell the people you know</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13, maxWidth: 560 }}>Your first users usually come from your own network. Send these one by one, from your own phone or account. Each has its own tracked link, so Momentum shows which circle responds.</p>
        </div>
        <form action={draftNetworkMessages}>
          <input type="hidden" name="ws" value={id} />
          <Submit className={`pr-btn ${kit ? '' : 'pr-btn-primary'}`} pending="Starting…" disabled={drafting}>{drafting ? <><span className="spin" /> Writing…</> : kit ? 'Write new versions' : 'Write my messages'}</Submit>
        </form>
      </div>

      {drafting && !kit && (
        <div className="pr-net" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="pr-net-card"><div className="sk sk-title" /><div className="sk sk-block" style={{ height: 110 }} /><div className="sk sk-line" style={{ width: '45%' }} /></div>)}</div>
      )}
      {kit && <NetworkMessages ws={id} messages={msgs} flags={msgs.flags ?? {}} links={(kit.links ?? {}) as Record<string, string>} sent={(kit.sent ?? {}) as Record<string, number>} />}
      {!kit && !drafting && <div className="pr-list"><div className="pr-empty"><h2>Your launch messages</h2><p>One for friends and family, one for LinkedIn connections, one for founders and ex-colleagues, and a LinkedIn post. Written in your voice, with a gap where only you know why you thought of them.</p></div></div>}

      <section className="pr-section">
        <div className="pr-section-h"><h2>Email your waitlist</h2><p>{page ? `${people ?? 0} ${people === 1 ? 'person is' : 'people are'} waiting to hear from you. We draft it, you approve it, it goes once to each.` : 'Publish a waitlist page first, then email everyone on it here.'}</p></div>
        <div className="pr-section-f" style={{ justifyContent: 'flex-start' }}>
          {!page ? <Link className="pr-btn" href={`/app/${id}/waitlist`}>Set up your waitlist</Link>
            : mail ? <Link className="pr-btn" href={`/app/${id}/${mail.status === 'pending' ? 'inbox' : 'waitlist'}`}>{mail.status === 'pending' ? 'Review it in your inbox' : 'See it on your waitlist page'}</Link>
            : (
              <form action={draftLaunchEmail}>
                <input type="hidden" name="ws" value={id} />
                <Submit className="pr-btn" pending="Starting…" disabled={mailing}>{mailing ? <><span className="spin" /> Writing…</> : 'Draft the launch email'}</Submit>
              </form>
            )}
        </div>
      </section>
    </div>
  );
}
