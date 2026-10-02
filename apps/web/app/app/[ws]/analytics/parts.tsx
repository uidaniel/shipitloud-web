'use client';

import { useActionState, useState } from 'react';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { makeShortLink } from '../../actions';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="pr-btn pr-btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* blocked */ } }}>
      {done ? Icon.check : Icon.copy} {done ? 'Copied' : label}
    </button>
  );
}

const CHANNELS = ['x', 'linkedin', 'instagram', 'tiktok', 'youtube', 'whatsapp', 'email', 'newsletter', 'bio', 'other'];

export function LinkForm({ ws, defaultTarget }: { ws: string; defaultTarget: string }) {
  const [state, action] = useActionState(makeShortLink, {});
  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h"><h2>New tracked link</h2><p>For your bio, newsletter, a talk or anywhere else. Posts we publish get one automatically.</p></div>
      <div className="pr-section-b" style={{ display: 'grid', gap: 12 }}>
        <div><label className="pr-label" htmlFor="lt">Page it opens</label><input id="lt" name="target" className="pr-input" defaultValue={defaultTarget} placeholder="yourproduct.com/pricing" /></div>
        <div className="pr-grid-2">
          <div>
            <label className="pr-label" htmlFor="ls">Where you’ll share it</label>
            <select id="ls" name="source" className="pr-select" defaultValue="bio">{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div><label className="pr-label" htmlFor="lc">Campaign (optional)</label><input id="lc" name="campaign" className="pr-input" placeholder="launch-week" maxLength={60} /></div>
        </div>
        {state.link && (
          <div className="pr-token pr-fade-in"><code>{state.link}</code><CopyButton text={state.link} /></div>
        )}
        {state.error && <p className="pr-error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
      </div>
      <div className="pr-section-f"><Submit pending="Creating…">Create link</Submit></div>
    </form>
  );
}
