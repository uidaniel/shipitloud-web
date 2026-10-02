'use client';

import { useState } from 'react';

export function Share({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const text = 'I just joined the ShipItLoud waitlist: the business co-founder for people who build. Skip the line with my link:';
  const enc = encodeURIComponent;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="share">
      <div className="copy">
        <code>{link}</code>
        <button className="btn btn-primary btn-sm" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      <div className="share-row">
        <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${enc(`${text} ${link}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a className="btn btn-ghost btn-sm" href={`https://x.com/intent/post?text=${enc(text)}&url=${enc(link)}`} target="_blank" rel="noopener noreferrer">X</a>
        <a className="btn btn-ghost btn-sm" href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(link)}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
      </div>
    </div>
  );
}
