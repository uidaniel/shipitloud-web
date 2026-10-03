'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Submit } from '@/components/app/ui';
import { submitTicket } from '@/app/app/actions';

// Help on every screen (PRD section 25): search the help articles, or write to us.
type Item = { slug: string; title: string; summary: string; tags: string[] };

export function HelpButton({ ws, items }: { ws: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [contact, setContact] = useState(false);
  const [state, action] = useActionState(submitTicket, {});
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? items.filter((a) => words.every((w) => `${a.title} ${a.summary} ${a.tags.join(' ')}`.toLowerCase().includes(w))) : items;

  return (
    <div className="hb" ref={ref}>
      {open && (
        <div className="hb-panel pr-fade-in" role="dialog" aria-label="Help">
          {!contact ? (
            <>
              <div className="hb-h"><b>How can we help?</b></div>
              <input className="pr-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: trial, reddit, delete…" autoFocus aria-label="Search help" />
              <ul className="hb-list">
                {hits.slice(0, 5).map((a) => <li key={a.slug}><a href={`/help/${a.slug}`} target="_blank" rel="noreferrer"><b>{a.title}</b><span>{a.summary}</span></a></li>)}
                {!hits.length && <li className="hb-none">Nothing found. Write to us below.</li>}
              </ul>
              <button type="button" className="pr-btn pr-btn-primary hb-contact" onClick={() => setContact(true)}>Contact us</button>
            </>
          ) : state.ok ? (
            <div className="hb-done">
              <b>Got it. We’ll reply by email within a day.</b>
              <span>While you wait, these answer most questions:</span>
              <ul className="hb-list">{items.slice(0, 3).map((a) => <li key={a.slug}><a href={`/help/${a.slug}`} target="_blank" rel="noreferrer"><b>{a.title}</b></a></li>)}</ul>
            </div>
          ) : (
            <form action={action} className="hb-form">
              <input type="hidden" name="ws" value={ws} />
              <div className="hb-h"><button type="button" className="pr-btn pr-btn-ghost pr-btn-sm" onClick={() => setContact(false)}>← Back</button><b>Write to us</b></div>
              <input className="pr-input" name="subject" placeholder="What’s it about?" maxLength={140} required defaultValue={q} />
              <textarea className="pr-textarea" name="body" rows={5} placeholder="Tell us what happened. Screens and steps help." maxLength={5000} required />
              {state.error && <p className="pr-error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
              <Submit className="pr-btn pr-btn-primary" pending="Sending…">Send</Submit>
            </form>
          )}
        </div>
      )}
      <button type="button" className="hb-btn" aria-label="Help" aria-expanded={open} onClick={() => setOpen(!open)}>?</button>
    </div>
  );
}
