'use client';

import { useState } from 'react';

export function ShareLink({ link, name }: { link: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const text = `I just joined the ${name} waitlist. Get in early:`;
  const enc = encodeURIComponent;
  return (
    <div className="wp-share">
      <div className="wp-link">
        <code>{link}</code>
        <button
          className="wp-btn"
          style={{ height: 40 }}
          onClick={async () => {
            try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <div className="wp-share-row">
        <a className="wp-ghost" href={`https://wa.me/?text=${enc(`${text} ${link}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a className="wp-ghost" href={`https://x.com/intent/post?text=${enc(text)}&url=${enc(link)}`} target="_blank" rel="noopener noreferrer">X</a>
        <a className="wp-ghost" href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(link)}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
      </div>
    </div>
  );
}
