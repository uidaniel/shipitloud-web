'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/app/icons';
import { PlatformIcon } from '@/components/space/platform-icons';
import { countNetworkSend } from '../../actions';
import { CopyButton } from '../analytics/parts';

export type Kind = 'friends' | 'professional' | 'peers' | 'linkedin_post';
const CARDS: { kind: Kind; title: string; who: string }[] = [
  { kind: 'friends', title: 'Friends and family', who: 'WhatsApp or text' },
  { kind: 'professional', title: 'LinkedIn connections', who: 'One message each' },
  { kind: 'peers', title: 'Founders and ex-colleagues', who: 'Email, Slack or DM' },
  { kind: 'linkedin_post', title: 'LinkedIn post', who: 'Everyone at once' },
];

function Card({ ws, kind, title, who, template, link, flags, sent: initial, name }: { ws: string; kind: Kind; title: string; who: string; template: string; link: string; flags: string[]; sent: number; name: string }) {
  const fill = (t: string) => t.replace(/\{\{name\}\}/g, name.trim() || 'there').replace(/\{\{link\}\}/g, link || '');
  const [text, setText] = useState<string | null>(null);   // null: follow the template as the name changes
  const [sent, setSent] = useState(initial);
  // Taps are counted on screen at once and sent one at a time, in order; quick taps would otherwise overlap and get lost.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const waiting = useRef(0);
  const shown = text ?? fill(template);
  const gap = /\[why them\]/i.test(shown);
  const bump = (d: 1 | -1) => {
    setSent((n) => Math.max(0, n + d));
    waiting.current++;
    queue.current = queue.current.then(async () => {
      const n = await countNetworkSend(ws, kind, d).catch(() => null);
      if (--waiting.current === 0 && n != null) setSent(n);
    });
  };

  return (
    <article className="pr-net-card">
      <header>
        <div><b>{title}</b><small>{who}</small></div>
        <span className={`pr-chip ${sent ? 'pr-chip-ok' : ''}`}>{kind === 'linkedin_post' ? (sent ? 'Posted' : 'Not posted') : `Sent to ${sent}`}</span>
      </header>
      <textarea className="pr-textarea" value={shown} onChange={(e) => setText(e.target.value)} rows={kind === 'linkedin_post' ? 9 : 6} aria-label={`${title} message`} />
      {gap && <p className="pr-net-note">Replace <b>[why them]</b> with a line only you could write. It’s what gets replies.</p>}
      {flags.length > 0 && <p className="pr-net-note warn">Check before sending: {flags.join(', ')}</p>}
      <div className="pr-net-act">
        {kind === 'friends' && <a className="pr-btn pr-btn-sm pr-btn-primary" href={`https://wa.me/?text=${encodeURIComponent(shown)}`} target="_blank" rel="noreferrer">{Icon.chat} WhatsApp</a>}
        {kind === 'professional' && <a className="pr-btn pr-btn-sm" href="https://www.linkedin.com/messaging/" target="_blank" rel="noreferrer"><PlatformIcon name="linkedin" size={15} /> Open messages</a>}
        {kind === 'linkedin_post' && <a className="pr-btn pr-btn-sm pr-btn-primary" href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shown)}`} target="_blank" rel="noreferrer"><PlatformIcon name="linkedin" size={15} /> Post on LinkedIn</a>}
        <CopyButton text={shown} />
        {text !== null && <button type="button" className="pr-btn pr-btn-sm pr-btn-ghost" onClick={() => setText(null)} title="Back to the draft">{Icon.undo}</button>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
          {kind === 'linkedin_post'
            ? <button type="button" className="pr-btn pr-btn-sm" onClick={() => bump(sent ? -1 : 1)}>{sent ? 'Undo' : 'I posted it'}</button>
            : <>
                {sent > 0 && <button type="button" className="pr-btn pr-btn-sm pr-btn-ghost" onClick={() => bump(-1)} aria-label="One fewer">−</button>}
                <button type="button" className="pr-btn pr-btn-sm" onClick={() => { bump(1); setText(null); }}>{Icon.check} Sent</button>
              </>}
        </span>
      </div>
    </article>
  );
}

export function NetworkMessages({ ws, messages, flags, links, sent }: { ws: string; messages: Partial<Record<Kind, string>>; flags: Partial<Record<Kind, string[]>>; links: Record<string, string>; sent: Record<string, number> }) {
  const [name, setName] = useState('');
  const total = CARDS.filter((c) => c.kind !== 'linkedin_post').reduce((n, c) => n + (sent[c.kind] ?? 0), 0);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="pr-net-bar">
        <div>
          <label className="pr-label" htmlFor="nname">Who are you messaging?</label>
          <input id="nname" className="pr-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" maxLength={40} autoComplete="off" />
        </div>
        <p>{total ? <><b>{total}</b> {total === 1 ? 'person' : 'people'} messaged so far. Aim for 30 in week one.</> : 'Type a name, send, tap Sent, repeat. Aim for 30 people in week one.'}</p>
      </div>
      <div className="pr-net">
        {CARDS.map((c) => messages[c.kind] ? (
          <Card key={`${c.kind}:${messages[c.kind]}`} ws={ws} {...c} template={messages[c.kind]!} link={links[c.kind] ?? ''} flags={flags[c.kind] ?? []} sent={sent[c.kind] ?? 0} name={name} />
        ) : null)}
      </div>
    </div>
  );
}
