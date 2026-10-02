'use client';

import { useActionState, useEffect, useState } from 'react';
import { Submit, kept, keptOn } from '@/components/app/ui';
import { draftBroadcastEmail, saveEmailSettings } from '../../actions';

function Status({ state, text }: { state: { ok?: boolean; error?: string }; text: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => { if (!state.ok) return; setShow(true); const t = setTimeout(() => setShow(false), 2400); return () => clearTimeout(t); }, [state]);
  if (state.error) return <span className="pr-error" role="alert" style={{ margin: 0, marginRight: 'auto' }}>{state.error}</span>;
  return show ? <span className="pr-fade-in" style={{ marginRight: 'auto', color: 'var(--ok)', fontSize: 13, alignSelf: 'center' }}>{text}</span> : null;
}

export function EmailSettingsForm({ ws, s, ownerEmail, product }: { ws: string; s: { from_name: string | null; reply_to: string | null; business_address: string | null; sequence_on: boolean }; ownerEmail: string; product: string }) {
  const [state, action] = useActionState(saveEmailSettings, {});
  // Uncontrolled fields whose defaults follow what was last submitted: React resets forms after every submit,
  // and controlled checkboxes desync from that reset. kept() makes the reset restore the person's input.
  const [name, setName] = useState(s.from_name ?? '');
  return (
    <form action={action}>
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-b" style={{ display: 'grid', gap: 14 }}>
        <div className="pr-grid-2">
          <div>
            <label className="pr-label" htmlFor="efn">From name</label>
            <input id="efn" name="from_name" className="pr-input" defaultValue={kept(state, 'from_name', s.from_name ?? '')} onChange={(e) => setName(e.target.value)} placeholder={`Ada at ${product}`} maxLength={60} />
            <p className="pr-hint">Shows as “{name || product} via ShipItLoud” until you connect your own domain.</p>
          </div>
          <div>
            <label className="pr-label" htmlFor="ert">Replies go to</label>
            <input id="ert" name="reply_to" type="email" className="pr-input" defaultValue={kept(state, 'reply_to', s.reply_to ?? '')} placeholder={ownerEmail} />
          </div>
        </div>
        <div>
          <label className="pr-label" htmlFor="eba">Business address</label>
          <input id="eba" name="business_address" className="pr-input" defaultValue={kept(state, 'business_address', s.business_address ?? '')} placeholder="Street, city, country (a PO box works)" maxLength={300} />
          <p className="pr-hint">Required at the bottom of marketing emails in the US (CAN-SPAM). We add it, with an unsubscribe link, to every email.</p>
        </div>
        <label className="pr-check-row">
          <input type="checkbox" name="sequence_on" defaultChecked={keptOn(state, 'sequence_on', s.sequence_on)} />
          <span><b>Send the waitlist emails automatically</b><small>Only the ones you’ve approved. Each person gets each email once.</small></span>
        </label>
      </div>
      <div className="pr-section-f"><Status state={state} text="Saved" /><Submit pending="Saving…">Save</Submit></div>
    </form>
  );
}

export function BroadcastForm({ ws, count }: { ws: string; count: number }) {
  const [state, action] = useActionState(draftBroadcastEmail, {});
  return (
    <form action={action} key={state.ok ? String(Date.now()) : 'b'}>
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-b" style={{ display: 'grid', gap: 10 }}>
        <label className="pr-label" htmlFor="btopic" style={{ margin: 0 }}>Email everyone on your waitlist ({count.toLocaleString('en-US')} people)</label>
        <div className="pr-inline-form">
          <input id="btopic" name="topic" className="pr-input" placeholder="What’s it about? e.g. we opened early access for the first 100" maxLength={300} />
          <Submit className="pr-btn" pending="Drafting…">Draft it</Submit>
        </div>
        <Status state={state} text="Drafting. It’ll be in your inbox to approve in a minute." />
      </div>
    </form>
  );
}
