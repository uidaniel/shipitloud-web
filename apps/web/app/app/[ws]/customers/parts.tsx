'use client';

import { useActionState, useEffect, useState } from 'react';
import { Submit, kept, keptOn } from '@/components/app/ui';
import { createApiKey, saveLifecycle } from '../../actions';
import { CopyButton } from '../analytics/parts';

export function LifecycleForm({ ws, v, needsAddress }: { ws: string; v: { emails_on: boolean; activation_event: string; upgrade_url: string; churn_alerts: boolean }; needsAddress: boolean }) {
  const [state, action] = useActionState(saveLifecycle, {});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!state.ok) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h"><h2>Settings</h2><p>Emails go out when each is due, once per person, with an unsubscribe link and your address.</p></div>
      <div className="pr-section-b" style={{ display: 'grid', gap: 14 }}>
        <div className="pr-grid-2">
          <div>
            <label className="pr-label" htmlFor="lae">Event that means “got value”</label>
            <input id="lae" name="activation_event" className="pr-input" defaultValue={kept(state, 'activation_event', v.activation_event)} placeholder="activated" maxLength={40} />
            <p className="pr-hint">Send it when a user does the thing that makes them stay, like sending their first invoice.</p>
          </div>
          <div>
            <label className="pr-label" htmlFor="lup">Upgrade link</label>
            <input id="lup" name="upgrade_url" className="pr-input" defaultValue={kept(state, 'upgrade_url', v.upgrade_url)} placeholder="yourproduct.com/pricing" />
            <p className="pr-hint">Where the trial and upgrade emails send people.</p>
          </div>
        </div>
        {needsAddress && (
          <div>
            <label className="pr-label" htmlFor="lba">Business address</label>
            <input id="lba" name="business_address" className="pr-input" defaultValue={kept(state, 'business_address', '')} placeholder="Street, city, country (a PO box is fine)" maxLength={300} />
            <p className="pr-hint">The law requires it in these emails. It’s shared with your waitlist emails.</p>
          </div>
        )}
        <label className="pr-check-row">
          <input type="checkbox" name="emails_on" defaultChecked={keptOn(state, 'emails_on', v.emails_on)} />
          <span><b>Send onboarding emails</b><small>Only the ones you approved. Turning this off stops them right away.</small></span>
        </label>
        <label className="pr-check-row">
          <input type="checkbox" name="churn_alerts" defaultChecked={keptOn(state, 'churn_alerts', v.churn_alerts)} />
          <span><b>Tell me when paying customers go quiet</b><small>Checked daily. We draft a personal email for you to approve; nothing is sent on its own.</small></span>
        </label>
      </div>
      <div className="pr-section-f">
        {state.error && <span className="pr-error" role="alert" style={{ margin: 0, marginRight: 'auto' }}>{state.error}</span>}
        {saved && <span className="pr-fade-in" style={{ marginRight: 'auto', color: 'var(--ok)', fontSize: 13, alignSelf: 'center' }}>Saved</span>}
        <Submit pending="Saving…">Save</Submit>
      </div>
    </form>
  );
}

export function NewKey({ ws }: { ws: string }) {
  const [state, action] = useActionState(createApiKey, {});
  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <input type="hidden" name="ws" value={ws} />
      {state.key && (
        <div className="pr-banner pr-banner-info pr-fade-in" style={{ margin: 0, display: 'grid', gap: 8 }}>
          <b>Your secret key. Copy it now, it won’t be shown again.</b>
          <div className="pr-token"><code>{state.key}</code><CopyButton text={state.key} /></div>
          <small style={{ color: 'var(--muted)' }}>Keep it on your server. Never put it in your website’s code.</small>
        </div>
      )}
      {state.error && <p className="pr-error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
      <div><Submit className="pr-btn pr-btn-sm" pending="Creating…">Create a secret key</Submit></div>
    </form>
  );
}
