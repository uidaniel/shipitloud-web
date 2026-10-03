import type { Metadata } from 'next';
import { Tiles } from '@/components/app/bento';
import { requireWorkspace } from '@/lib/supabase/server';
import { site } from '@/lib/site';
import Link from 'next/link';
import { Submit } from '@/components/app/ui';
import { draftSequence } from '../../actions';
import { BroadcastForm, EmailSettingsForm } from './email-forms';
import { PageEditor } from './editor';

export const metadata: Metadata = { title: 'Waitlist' };

export default async function Waitlist({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, ws, user } = await requireWorkspace(id);
  const [{ data: page }, { data: brain }] = await Promise.all([
    sb.from('waitlist_pages').select('id, slug, headline, subhead, cta, show_badge, published_at').eq('workspace_id', id).maybeSingle(),
    sb.from('brand_brains').select('one_liner, summary').eq('workspace_id', id).maybeSingle(),
  ]);
  const { data: signups, count } = page
    ? await sb.from('waitlist_signups').select('email, source, referral_count, created_at, unsubscribed_at', { count: 'exact' }).eq('page_id', page.id).order('created_at', { ascending: false }).limit(50)
    : { data: [], count: 0 };
  const url = page ? `${site.url}/p/${page.slug}` : null;
  const [{ data: emailSettings }, { data: emails }, { data: sends }, { count: unsubscribed }, { data: drafting }] = await Promise.all([
    sb.from('email_settings').select('from_name, reply_to, business_address, sequence_on').eq('workspace_id', id).maybeSingle(),
    sb.from('assets').select('id, title, status, content, prompt_version, updated_at').eq('workspace_id', id).eq('type', 'email').not('status', 'in', '(rejected,expired)').order('updated_at', { ascending: false }).limit(30),
    sb.from('email_sends').select('asset_id, status').eq('workspace_id', id).limit(20000),
    sb.from('waitlist_signups').select('id', { count: 'exact', head: true }).eq('workspace_id', id).not('unsubscribed_at', 'is', null),
    sb.from('jobs').select('type').eq('workspace_id', id).in('type', ['email.draft_sequence', 'email.draft_broadcast']).in('status', ['queued', 'running']),
  ]);
  const sentCount = new Map<string, { sent: number; simulated: number; failed: number }>();
  for (const x of sends ?? []) { const c = sentCount.get(x.asset_id) ?? { sent: 0, simulated: 0, failed: 0 }; c[x.status as 'sent' | 'simulated' | 'failed']++; sentCount.set(x.asset_id, c); }
  const KINDS = ['welcome', 'referral_nudge', 'countdown', 'launch_day'];
  const KIND_LABEL: Record<string, string> = { welcome: 'Welcome', referral_nudge: 'Referral nudge, day 2', countdown: 'Countdown, day before launch', launch_day: 'Launch day', broadcast: 'One-off' };
  const sequence = KINDS.map((k) => (emails ?? []).find((e) => e.prompt_version === 'waitlist_emails@1' && (e.content as { kind?: string }).kind === k)).filter(Boolean) as NonNullable<typeof emails>;
  const broadcasts = (emails ?? []).filter((e) => (e.content as { kind?: string }).kind === 'broadcast');
  const writing = !!drafting?.some((d) => d.type === 'email.draft_sequence');
  const STATUS: Record<string, { label: string; cls: string }> = { pending: { label: 'Needs you', cls: 'pr-chip-warn' }, approved: { label: 'On', cls: 'pr-chip-ok' }, auto_approved: { label: 'On', cls: 'pr-chip-ok' }, published: { label: 'Sent', cls: 'pr-chip-ok' }, scheduled: { label: 'Sending', cls: 'pr-chip-violet' }, failed: { label: 'Not sent', cls: 'pr-chip-err' } };
  const emailRow = (e: NonNullable<typeof emails>[number]) => {
    const c = e.content as { kind: string; subject: string };
    const st = STATUS[e.status] ?? { label: e.status, cls: '' };
    const n = sentCount.get(e.id);
    const parts = n ? [n.sent ? `${n.sent} sent` : '', n.simulated ? `${n.simulated} in test mode` : '', n.failed ? `${n.failed} failed` : ''].filter(Boolean).join(' · ') : '';
    return (
      <div key={e.id} className="pr-item" style={{ alignItems: 'center' }}>
        <div className="pr-item-main">
          <span className="pr-item-title">{c.subject}</span>
          <div className="pr-item-meta"><span>{KIND_LABEL[c.kind] ?? c.kind}</span>{parts && <span>{parts}</span>}</div>
        </div>
        <div className="pr-item-act"><span className={`pr-chip ${st.cls}`}>{st.label}</span>{e.status === 'pending' && <Link className="pr-btn pr-btn-sm" href={`/app/${id}/inbox`}>Review</Link>}</div>
      </div>
    );
  };
  const sources = new Map<string, number>();
  for (const s of signups ?? []) sources.set(s.source, (sources.get(s.source) ?? 0) + 1);

  return (
    <div className="pr-body" style={{ maxWidth: 900, display: "grid", gap: 18 }}>
      <div><h1 className="pr-h1">Waitlist</h1><p className="pr-lead" style={{ margin: '6px 0 0' }}>A page people can join before launch, and the emails they get.</p></div>
      <Tiles items={[
        { label: 'Signups', value: count ?? 0, tone: 'violet', sub: page?.published_at ? 'on your page' : 'publish your page to start' },
        { label: 'Top source', value: sources.size ? [...sources].sort((a, b) => b[1] - a[1])[0]![0] : '–', text: true, tone: 'mesh' },
        { label: 'Referrals', value: (signups ?? []).reduce((n, x) => n + (x.referral_count ?? 0), 0), tone: 'lime', sub: 'friends invited' },
      ]} />
      <PageEditor
        ws={id}
        paid={ws.plan !== 'free'}
        url={url}
        page={{
          slug: page?.slug ?? '',
          headline: page?.headline ?? brain?.one_liner ?? '',
          subhead: page?.subhead ?? brain?.summary ?? '',
          cta: page?.cta ?? 'Join the waitlist',
          show_badge: page?.show_badge ?? true,
          published: !!page?.published_at,
        }}
        suggestedSlug={ws.product_name}
      />

      {page && (
        <section className="pr-section" id="emails">
          <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2>Emails to your waitlist</h2>
              <p>{emailSettings?.sequence_on ? 'On: approved emails go out on their own.' : 'Off.'}{unsubscribed ? ` · ${unsubscribed} unsubscribed` : ''}</p>
            </div>
            <form action={draftSequence}><input type="hidden" name="ws" value={id} /><Submit className="pr-btn pr-btn-sm" pending="Starting..." disabled={writing}>{writing ? 'Writing...' : sequence.length ? 'Rewrite the emails' : 'Write my waitlist emails'}</Submit></form>
          </div>
          {writing && !sequence.length ? (
            <div className="pr-list" aria-busy="true" style={{ margin: 0, border: 0 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="pr-item"><div style={{ display: 'grid', gap: 8 }}><div className="sk sk-title" /><div className="sk sk-line" style={{ width: '40%' }} /></div><div /></div>)}</div>
          ) : sequence.length ? <div className="pr-list" style={{ margin: 0, border: 0, borderRadius: 0 }}>{sequence.map(emailRow)}</div>
            : <div className="pr-section-b"><p className="pr-hint" style={{ margin: 0 }}>Four short emails in your voice: a welcome with their place and share link, a nudge two days later, the day before launch, and launch day.</p></div>}
          <div style={{ borderTop: '1px solid var(--line)' }}>
            <EmailSettingsForm ws={id} ownerEmail={user.email ?? ''} product={ws.product_name} s={{ from_name: emailSettings?.from_name ?? null, reply_to: emailSettings?.reply_to ?? null, business_address: emailSettings?.business_address ?? null, sequence_on: !!emailSettings?.sequence_on }} />
          </div>
          <div style={{ borderTop: '1px solid var(--line)' }}>
            <BroadcastForm ws={id} count={(count ?? 0) - (unsubscribed ?? 0)} />
            {!!broadcasts.length && <div className="pr-list" style={{ margin: 0, border: 0, borderRadius: 0, borderTop: '1px solid var(--line)' }}>{broadcasts.map(emailRow)}</div>}
          </div>
        </section>
      )}

      {page && (
        <section className="pr-section">
          <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
            <div>
              <h2>Signups</h2>
              <p>{count ? `${count} so far${sources.size ? ` · top source: ${[...sources].sort((a, b) => b[1] - a[1])[0]![0]}` : ''}` : 'Share your page to get your first signup.'}</p>
            </div>
            {!!count && <a className="pr-btn pr-btn-sm" href={`/app/${id}/waitlist/export`}>Export CSV</a>}
          </div>
          {!!signups?.length && (
            <div className="pr-table-wrap" style={{ borderRadius: 0 }}>
              <table className="pr-table" style={{ border: 0, borderRadius: 0 }}>
                <thead><tr><th>Email</th><th>Source</th><th>Referrals</th><th>Joined</th></tr></thead>
                <tbody>
                  {signups.map((s) => (
                    <tr key={s.email + s.created_at}>
                      <td className="t-main">{s.email}{s.unsubscribed_at && <span className="pr-chip" style={{ marginLeft: 8 }}>Unsubscribed</span>}</td>
                      <td style={{ color: 'var(--muted)' }}>{s.source}</td>
                      <td>{s.referral_count}</td>
                      <td className="t-time">{new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
