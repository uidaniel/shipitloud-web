'use client';

import { useActionState, useEffect, useState } from 'react';
import { Submit, kept, keptOn } from '@/components/app/ui';
import { changePassword, createExtensionToken, revokeExtensionToken, saveAutomation, saveNotifications, saveProduct, setKillSwitch, signOutEverywhere } from '../../actions';
import { PasswordInput } from '@/components/app/auth';

function Saved({ state }: { state: { ok?: boolean; error?: string } }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!state.ok) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2000);
    return () => clearTimeout(t);
  }, [state]);
  if (state.error) return <span className="pr-error" role="alert" style={{ margin: 0, marginRight: 'auto' }}>{state.error}</span>;
  return show ? <span className="pr-fade-in" style={{ marginRight: 'auto', color: 'var(--ok)', fontSize: 13, alignSelf: 'center' }}>Saved</span> : null;
}

const MODES = [
  { id: 'manual', name: 'Manual', desc: 'You approve everything. The safest start.' },
  { id: 'trust', name: 'Trust', desc: 'Scheduled posts, posters and emails that pass our checks go out on their own. Replies still need you.' },
  { id: 'full', name: 'Full trust', desc: 'Also routine replies on low-risk sites like Hacker News and Bluesky. Ads and new campaigns always need you.' },
] as const;

export function AutomationForm({ ws, mode, threshold, dropped }: { ws: string; mode: string; threshold: number; dropped: string | null }) {
  const [state, action] = useActionState(saveAutomation, {});
  const [value, setValue] = useState(threshold);
  const [m, setM] = useState(mode);
  return (
    <form action={action} className="pr-section" key={mode + threshold}>
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h">
        <h2>Approvals</h2>
        <p>Choose how much ShipItLoud can do without asking. You can change this any time.</p>
      </div>
      <div className="pr-section-b">
        {dropped && mode === 'manual' && <div className="pr-banner pr-banner-warn" style={{ margin: 0 }}>We switched you back to Manual: {dropped}</div>}
        <div className="pr-modes" role="radiogroup" aria-label="Approval mode">
          {MODES.map((o) => (
            <label key={o.id} className="pr-mode">
              <input type="radio" name="trust_mode" value={o.id} defaultChecked={keptOn(state, 'trust_mode', mode === o.id, o.id)} onChange={() => setM(o.id)} />
              <b>{o.name}</b>
              <span>{o.desc}</span>
            </label>
          ))}
        </div>
        {m !== 'manual' && (
          <div className="pr-fade-in">
            <label className="pr-label" htmlFor="th">Only auto-approve items that score at least <b style={{ color: 'var(--text)' }}>{value}</b> / 100</label>
            <input id="th" className="pr-range" type="range" name="trust_threshold" min={50} max={100} step={1} defaultValue={kept(state, 'trust_threshold', String(threshold))} onChange={(e) => setValue(Number(e.target.value))} />
            <p className="pr-hint">Higher means fewer items go out on their own. Auto-approved items wait 15 minutes so you can undo them.</p>
          </div>
        )}
        {m === 'manual' && <input type="hidden" name="trust_threshold" value={value} />}
      </div>
      <div className="pr-section-f"><Saved state={state} /><Submit pending="Saving…">Save</Submit></div>
    </form>
  );
}

export function KillSwitch({ ws, on }: { ws: string; on: boolean }) {
  return (
    <form action={setKillSwitch} className="pr-section" style={on ? { borderColor: 'rgba(248,113,113,.4)' } : undefined}>
      <input type="hidden" name="ws" value={ws} />
      <input type="hidden" name="on" value={on ? 'false' : 'true'} />
      <div className="pr-section-b">
        <div className="pr-row">
          <div className="pr-row-t">
            <b>Kill switch</b>
            <span>{on ? 'On. Nothing posts, sends or spends until you turn it off.' : 'Stops every post, email and ad spend instantly.'}</span>
          </div>
          <Submit className={on ? 'pr-btn' : 'pr-btn pr-btn-danger'} pending={on ? 'Turning off…' : 'Stopping…'}>
            {on ? 'Turn off' : 'Stop everything'}
          </Submit>
        </div>
      </div>
    </form>
  );
}

export function ProductForm({ ws, name, url, launchDate }: { ws: string; name: string; url: string; launchDate: string }) {
  const [state, action] = useActionState(saveProduct, {});
  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h"><h2>Product</h2></div>
      <div className="pr-section-b">
        <div className="pr-grid-2">
          <div><label className="pr-label" htmlFor="pn">Name</label><input id="pn" name="product_name" className="pr-input" defaultValue={kept(state, 'product_name', name)} required maxLength={80} /></div>
          <div><label className="pr-label" htmlFor="pu">Link</label><input id="pu" name="url" className="pr-input" defaultValue={kept(state, 'url', url)} placeholder="yourproduct.com" inputMode="url" /></div>
        </div>
        <div style={{ maxWidth: 260 }}>
          <label className="pr-label" htmlFor="ld">Launch date</label>
          <input id="ld" name="launch_date" type="date" className="pr-input" defaultValue={kept(state, 'launch_date', launchDate)} />
          <p className="pr-hint">Your 30-day plan counts down to this.</p>
        </div>
      </div>
      <div className="pr-section-f"><Saved state={state} /><Submit pending="Saving…">Save</Submit></div>
    </form>
  );
}

export function NotificationsForm({ email, slack, webhook, address }: { email: boolean; slack: boolean; webhook: string; address: string }) {
  const [state, action] = useActionState(saveNotifications, {});
  const [slackOn, setSlackOn] = useState(slack);
  return (
    <form action={action} className="pr-section">
      <div className="pr-section-h">
        <h2>Notifications</h2>
        <p>We ping you when something needs approval or is about to expire.</p>
      </div>
      <div className="pr-section-b">
        <div className="pr-row">
          <div className="pr-row-t"><b>Email</b><span>{address}</span></div>
          <span className="pr-switch"><input type="checkbox" name="email" defaultChecked={keptOn(state, 'email', email)} aria-label="Email notifications" /><i /></span>
        </div>
        <div className="pr-row">
          <div className="pr-row-t"><b>Slack</b><span>Post to a channel through an incoming webhook.</span></div>
          <span className="pr-switch"><input type="checkbox" name="slack" defaultChecked={keptOn(state, 'slack', slack)} onChange={(e) => setSlackOn(e.target.checked)} aria-label="Slack notifications" /><i /></span>
        </div>
        {slackOn && (
          <div className="pr-fade-in">
            <label className="pr-label" htmlFor="wh">Slack webhook URL</label>
            <input id="wh" name="slack_webhook" className="pr-input" defaultValue={kept(state, 'slack_webhook', webhook)} placeholder="https://hooks.slack.com/services/…" />
          </div>
        )}
        {!slackOn && <input type="hidden" name="slack_webhook" value={webhook} />}
      </div>
      <div className="pr-section-f"><Saved state={state} /><Submit pending="Saving…">Save</Submit></div>
    </form>
  );
}

export function AccountForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [state, action] = useActionState(changePassword, {});
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  useEffect(() => { if (state.ok) { setCurrent(''); setPassword(''); setConfirm(''); } }, [state]);
  return (
    <div className="pr-section">
      <div className="pr-section-h">
        <h2>Account</h2>
        <p>Signed in as {email}.</p>
      </div>
      <form action={action}>
        <div className="pr-section-b" style={{ display: 'grid', gap: 14 }}>
          <b style={{ fontSize: 14, fontWeight: 600 }}>{hasPassword ? 'Change password' : 'Set a password'}</b>
          {!hasPassword && <p className="pr-hint" style={{ margin: '-8px 0 0' }}>You log in with email links today. Add a password to log in without waiting for an email.</p>}
          {hasPassword && (
            <div><label className="pr-label" htmlFor="cur">Current password</label><PasswordInput id="cur" name="current" autoComplete="current-password" value={current} onChange={setCurrent} /></div>
          )}
          <div className="pr-grid-2">
            <div><label className="pr-label" htmlFor="np">New password</label><PasswordInput id="np" name="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={setPassword} /></div>
            <div><label className="pr-label" htmlFor="cp2">Type it again</label><PasswordInput id="cp2" name="confirm" autoComplete="new-password" value={confirm} onChange={setConfirm} /></div>
          </div>
        </div>
        <div className="pr-section-f"><Saved state={state} /><Submit pending="Saving…">{hasPassword ? 'Change password' : 'Set password'}</Submit></div>
      </form>
      <form action={signOutEverywhere} className="pr-section-b" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="pr-row">
          <div className="pr-row-t"><b>Sign out everywhere</b><span>Ends your session on every device, including this one.</span></div>
          <Submit className="pr-btn" pending="Signing out…">Sign out everywhere</Submit>
        </div>
      </form>
    </div>
  );
}

export function ExtensionForm({ ws, tokens }: { ws: string; tokens: { id: string; label: string; last_used_at: string | null; created_at: string }[] }) {
  const [state, action] = useActionState(createExtensionToken, {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="pr-section" id="extension">
      <div className="pr-section-h">
        <h2>Chrome extension</h2>
        <p>Find Reddit posts worth replying to and draft replies right on Reddit. Your browser does the reading; you click post.</p>
      </div>
      <div className="pr-section-b" style={{ display: 'grid', gap: 14 }}>
        {state.token ? (
          <div className="pr-banner pr-banner-info pr-fade-in" style={{ margin: 0, display: "grid", gap: 10 }}>
            <b>Paste this into the extension. It won&apos;t be shown again.</b>
            <div className="pr-token">
              <code>{state.token}</code>
              <button type="button" className="pr-btn pr-btn-sm" onClick={async () => { await navigator.clipboard.writeText(state.token!); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
        ) : (
          <ol className="pr-steps">
            <li>Install the ShipItLoud extension in Chrome.</li>
            <li>Create a connection below and paste it into the extension.</li>
            <li>Open Reddit. Posts worth a reply show up in the ShipItLoud panel.</li>
          </ol>
        )}
        {tokens.length > 0 && (
          <div className="pr-list" style={{ margin: 0 }}>
            {tokens.map((t) => (
              <div key={t.id} className="pr-row" style={{ padding: '10px 14px' }}>
                <div className="pr-row-t"><b>{t.label}</b><span>{t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not used yet'}</span></div>
                <form action={revokeExtensionToken}><input type="hidden" name="ws" value={ws} /><input type="hidden" name="id" value={t.id} /><Submit className="pr-btn pr-btn-ghost pr-btn-sm" pending="Removing…">Remove</Submit></form>
              </div>
            ))}
          </div>
        )}
        {state.error && <p className="pr-error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
      </div>
      <form action={action} className="pr-section-f">
        <input type="hidden" name="ws" value={ws} />
        <Submit pending="Creating…">{tokens.length ? 'Connect another browser' : 'Connect the extension'}</Submit>
      </form>
    </div>
  );
}
