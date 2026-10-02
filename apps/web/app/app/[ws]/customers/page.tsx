import type { Metadata } from 'next';
import Link from 'next/link';
import { churnRisk } from '@shipitloud/engine';
import { requireWorkspace } from '@/lib/supabase/server';
import { site } from '@/lib/site';
import { Submit } from '@/components/app/ui';
import { draftLifecycle, revokeApiKey } from '../../actions';
import { CopyButton } from '../analytics/parts';
import { KitRefresher } from '../kit/refresher';
import { LifecycleForm, NewKey } from './parts';

export const metadata: Metadata = { title: 'Customers' };

const KINDS = [
  { kind: 'welcome', label: 'Welcome', when: 'Right after signup' },
  { kind: 'activation_nudge', label: 'Activation nudge', when: 'Day 2, if they haven’t activated' },
  { kind: 'trial_ending', label: 'Trial ending', when: 'In the last 3 days of a trial' },
  { kind: 'upgrade_offer', label: 'Upgrade offer', when: 'Active on free for a week' },
] as const;
const STATUS_CHIP: Record<string, string> = { paid: 'pr-chip-ok', trial: 'pr-chip-violet', free: '', churned: 'pr-chip-warn' };
const ago = (iso: string | null) => {
  if (!iso) return '–';
  const d = (Date.now() - Date.parse(iso)) / 86_400_000;
  return d < 1 / 24 ? 'just now' : d < 1 ? `${Math.floor(d * 24)}h ago` : `${Math.floor(d)}d ago`;
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

interface U { id: string; external_id: string; email: string | null; name: string | null; status: string; signed_up_at: string; activated_at: string | null; last_seen_at: string | null; at_risk_at: string | null; paid_at: string | null }

export default async function Customers({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb } = await requireWorkspace(id);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: users }, { data: cohort }, { data: settings }, { data: email }, { data: emails }, { data: keys }, { data: drafting }, { data: activity }, { data: winbacks }, { data: key }, { data: sends }] = await Promise.all([
    sb.from('end_users').select('id, external_id, email, name, status, signed_up_at, activated_at, last_seen_at, at_risk_at, paid_at').eq('workspace_id', id).order('signed_up_at', { ascending: false }).limit(25),
    sb.from('end_users').select('status, activated_at, paid_at').eq('workspace_id', id).gte('signed_up_at', since).limit(10_000),
    sb.from('lifecycle_settings').select('emails_on, activation_event, upgrade_url, churn_alerts').eq('workspace_id', id).maybeSingle(),
    sb.from('email_settings').select('business_address').eq('workspace_id', id).maybeSingle(),
    sb.from('assets').select('id, status, content, updated_at').eq('workspace_id', id).eq('type', 'email').eq('content->>lifecycle', 'true').neq('status', 'rejected').order('updated_at', { ascending: false }),
    sb.from('api_keys').select('id, prefix, created_at, last_used_at').eq('workspace_id', id).is('revoked_at', null).order('created_at', { ascending: false }),
    sb.from('jobs').select('id').eq('workspace_id', id).eq('type', 'lifecycle.draft').in('status', ['queued', 'running']).limit(1),
    sb.rpc('user_activity', { p_ws: id }),
    sb.from('assets').select('id, status, content').eq('workspace_id', id).eq('type', 'email').eq('prompt_version', 'winback@1').order('created_at', { ascending: false }).limit(50),
    sb.from('workspaces').select('tracking_key').eq('id', id).single(),
    sb.from('lifecycle_sends').select('kind').eq('workspace_id', id).gte('created_at', since).limit(10_000),
  ]);
  const s = { emails_on: settings?.emails_on ?? false, activation_event: settings?.activation_event ?? 'activated', upgrade_url: settings?.upgrade_url ?? '', churn_alerts: settings?.churn_alerts ?? true };
  const c = (cohort ?? []) as { status: string; activated_at: string | null; paid_at: string | null }[];
  const signed = c.length;
  const activated = c.filter((u) => u.activated_at).length;
  const paying = c.filter((u) => u.status === 'paid').length;
  const all = (users ?? []) as U[];
  const { count: payingAll } = await sb.from('end_users').select('id', { count: 'exact', head: true }).eq('workspace_id', id).eq('status', 'paid');
  const { data: riskRows } = await sb.from('end_users').select('id, external_id, email, name, status, signed_up_at, activated_at, last_seen_at, at_risk_at, paid_at').eq('workspace_id', id).not('at_risk_at', 'is', null).eq('status', 'paid').limit(50);
  const risk = (riskRows ?? []) as U[];
  const act = new Map(((activity ?? []) as { end_user_id: string; recent: number; previous: number; last_event: string | null }[]).map((a) => [a.end_user_id, a]));
  const winFor = new Map(((winbacks ?? []) as { id: string; status: string; content: { end_user_id?: string } }[]).filter((w) => w.content.end_user_id).map((w) => [w.content.end_user_id!, w]));
  const byKind = new Map<string, { status: string }>();
  for (const e of (emails ?? []) as { status: string; content: { kind?: string } }[]) if (e.content.kind && !byKind.has(e.content.kind)) byKind.set(e.content.kind, e);
  const sentBy = new Map<string, number>();
  for (const x of sends ?? []) sentBy.set(x.kind, (sentBy.get(x.kind) ?? 0) + 1);
  const busy = !!drafting?.length;
  const connected = all.length > 0;
  const curl = `curl -X POST ${site.url}/api/v1/track \\
  -H "Authorization: Bearer YOUR_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"user":{"id":"u_123","email":"ada@example.com","name":"Ada","status":"trial","trial_ends_at":"2026-11-01"},"event":"signup"}'`;
  const browser = `// After someone logs in to your app (your own user id, never an email):
shipitloud('identify', user.id);
// When they do the thing that means they got value:
shipitloud('${s.activation_event}');
// On log out:
shipitloud('reset');`;

  return (
    <div className="pr-body" style={{ display: 'grid', gap: 20 }}>
      {busy && <KitRefresher />}
      <div>
        <h1 className="pr-h1">Customers</h1>
        <p className="pr-lead">Turn signups into paying customers, and notice when paying ones go quiet.</p>
      </div>

      <div className="pr-stats">
        <div className="pr-stat"><span>Signed up</span><b>{signed}</b><small>Last 30 days</small></div>
        <div className="pr-stat"><span>Activated</span><b>{activated}</b><small>{signed ? `${pct(activated, signed)}% of signups` : '–'}</small></div>
        <div className="pr-stat"><span>Paying</span><b>{payingAll ?? 0}</b><small>{signed ? `${pct(paying, signed)}% of last 30 days’ signups` : '–'}</small></div>
        <div className="pr-stat"><span>Going quiet</span><b style={{ color: risk.length ? 'var(--warn)' : undefined }}>{risk.length}</b><small>Paying customers</small></div>
      </div>

      {signed > 0 && (
        <section className="pr-section">
          <div className="pr-section-h"><h2>From signup to paid</h2><p>People who signed up in the last 30 days.</p></div>
          <div className="pr-section-b pr-funnel">
            {[{ label: 'Signed up', n: signed }, { label: `Activated (“${s.activation_event}”)`, n: activated }, { label: 'Paying', n: paying }].map((f) => (
              <div key={f.label}>
                <span>{f.label}</span>
                <div className="bar"><i style={{ width: `${Math.max(f.n ? 2 : 0, pct(f.n, signed))}%` }} /></div>
                <b>{f.n} <small>{pct(f.n, signed)}%</small></b>
              </div>
            ))}
          </div>
        </section>
      )}

      {risk.length > 0 && (
        <section className="pr-section" id="risk">
          <div className="pr-section-h"><h2>Going quiet</h2><p>Paying customers whose activity fell. A short, personal note usually works better than a discount.</p></div>
          <div className="pr-list" style={{ margin: 0, border: 0, borderRadius: 0 }}>
            {risk.map((u) => {
              const a = act.get(u.id);
              const w = winFor.get(u.id);
              return (
                <div key={u.id} className="pr-item pr-item-2" style={{ alignItems: 'center' }}>
                  <div className="pr-item-main">
                    <span className="pr-item-title">{u.name || u.email || u.external_id}</span>
                    <div className="pr-item-meta"><span>{a ? churnRisk(a).reason || 'Activity is back up' : 'No activity on record'}</span><span>Paying since {u.paid_at ? new Date(u.paid_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '–'}</span></div>
                  </div>
                  <div className="pr-item-act">
                    {w ? <Link className="pr-btn pr-btn-sm" href={`/app/${id}/${w.status === 'pending' ? 'inbox' : 'activity'}`}>{w.status === 'pending' ? 'Review the email' : w.status === 'published' ? 'Email sent' : 'See the email'}</Link>
                      : <span className="pr-hint" style={{ margin: 0 }}>{u.email ? 'Email being drafted' : 'No email on record'}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="pr-grid-2" style={{ alignItems: 'start' }}>
        <section className="pr-section">
          <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div><h2>Onboarding emails</h2><p>Written in your voice, approved by you once, then sent when each is due.</p></div>
            <form action={draftLifecycle}><input type="hidden" name="ws" value={id} /><Submit className={`pr-btn pr-btn-sm ${byKind.size ? '' : 'pr-btn-primary'}`} pending="Starting…" disabled={busy}>{busy ? <><span className="spin" /> Writing…</> : byKind.size ? 'Write new versions' : 'Write my emails'}</Submit></form>
          </div>
          <div className="pr-list" style={{ margin: 0, border: 0, borderRadius: 0 }}>
            {KINDS.map((k) => {
              const e = byKind.get(k.kind);
              const live = e && ['approved', 'auto_approved'].includes(e.status);
              return busy && !e ? (
                <div key={k.kind} className="pr-item pr-item-2"><div style={{ display: 'grid', gap: 8, width: '100%' }}><div className="sk sk-title" /><div className="sk sk-line" style={{ width: '50%' }} /></div></div>
              ) : (
                <div key={k.kind} className="pr-item pr-item-2" style={{ alignItems: 'center' }}>
                  <div className="pr-item-main">
                    <span className="pr-item-title">{k.label}</span>
                    <div className="pr-item-meta"><span>{k.when}</span>{live && <span>{sentBy.get(k.kind) ?? 0} sent in 30 days</span>}</div>
                  </div>
                  <div className="pr-item-act">
                    {!e ? <span className="pr-chip">Not written</span> : live ? <span className={`pr-chip ${s.emails_on ? 'pr-chip-ok' : ''}`}>{s.emails_on ? 'On' : 'Approved, paused'}</span>
                      : e.status === 'pending' ? <Link className="pr-chip pr-chip-warn" href={`/app/${id}/inbox`}>Needs you</Link> : <span className="pr-chip">{e.status}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <LifecycleForm ws={id} v={s} needsAddress={(email?.business_address ?? '').trim().length < 10} />
      </div>

      <section className="pr-section" id="connect">
        <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><h2>Connect your app</h2><p>Two small steps. The first works on its own; the second lets us email your users.</p></div>
          <span className={`pr-chip ${connected ? 'pr-chip-ok' : ''}`}>{connected ? `Receiving · last user ${ago(all[0]!.signed_up_at)}` : 'Nothing received yet'}</span>
        </div>
        <div className="pr-section-b pr-connect">
          <div>
            <h3><span className="n">1</span> In your app’s pages</h3>
            <p>With the <Link className="pr-link" href={`/app/${id}/analytics#snippet`}>tracking snippet</Link> installed, add these calls. They send an id and events only, nothing personal.</p>
            <div className="pr-code-block"><pre>{browser}</pre><CopyButton text={browser} /></div>
            {!key?.tracking_key && <p className="pr-hint">Add the snippet first.</p>}
          </div>
          <div>
            <h3><span className="n">2</span> From your server</h3>
            <p>Send email, plan and trial dates when people sign up, upgrade or cancel. Events named “paid” or “cancelled” update their status.</p>
            <div className="pr-code-block"><pre>{curl}</pre><CopyButton text={curl} /></div>
            <div style={{ display: 'grid', gap: 8 }}>
              {(keys ?? []).map((k) => (
                <div key={k.id} className="pr-key-row">
                  <code>{k.prefix}…</code>
                  <span>Created {new Date(k.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {k.last_used_at ? `used ${ago(k.last_used_at)}` : 'not used yet'}</span>
                  <form action={revokeApiKey}><input type="hidden" name="ws" value={id} /><input type="hidden" name="id" value={k.id} /><Submit className="pr-btn pr-btn-ghost pr-btn-sm" pending="…">Revoke</Submit></form>
                </div>
              ))}
              <NewKey ws={id} />
            </div>
          </div>
        </div>
      </section>

      <section className="pr-section">
        <div className="pr-section-h"><h2>Latest users</h2><p>Newest first.</p></div>
        {all.length ? (
          <div className="pr-table-wrap"><table className="pr-table pr-table-tight">
            <thead><tr><th>User</th><th>Status</th><th className="hide-sm">Signed up</th><th>Activated</th><th className="hide-sm">Last seen</th></tr></thead>
            <tbody>
              {all.map((u) => (
                <tr key={u.id}>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.email || <span style={{ color: 'var(--faint)' }}>{u.external_id}</span>}{u.at_risk_at && u.status === 'paid' && <span className="pr-chip pr-chip-warn" style={{ marginLeft: 8 }}>Quiet</span>}</td>
                  <td><span className={`pr-chip ${STATUS_CHIP[u.status] ?? ''}`}>{u.status}</span></td>
                  <td className="hide-sm">{ago(u.signed_up_at)}</td>
                  <td>{u.activated_at ? '✓' : <span style={{ color: 'var(--faint)' }}>Not yet</span>}</td>
                  <td className="hide-sm">{ago(u.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <div className="pr-section-b"><p className="pr-hint" style={{ margin: 0 }}>Users show up here once your app sends the first one (step 1 or 2 above).</p></div>}
      </section>
    </div>
  );
}
