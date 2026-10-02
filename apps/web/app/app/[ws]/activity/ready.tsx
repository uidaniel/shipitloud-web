'use client';

import { useState } from 'react';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { Icon } from '@/components/app/icons';
import { Submit } from '@/components/app/ui';
import { markPosted } from '../../actions';

const ICONS = new Set(['x', 'linkedin', 'reddit', 'hn', 'instagram', 'tiktok', 'email']);

const ALSO: Record<string, { label: string; href: string }> = {
  tiktok: { label: 'TikTok', href: 'https://www.tiktok.com/upload' },
  youtube: { label: 'YouTube Shorts', href: 'https://www.youtube.com/upload' },
  instagram: { label: 'Instagram', href: 'https://www.instagram.com/' },
  linkedin: { label: 'LinkedIn', href: 'https://www.linkedin.com/feed/?shareActive=true' },
};

export function ReadyToPost({ ws, item }: { ws: string; item: { id: string; title: string; platform: string | null; text: string; openUrl: string | null; files?: { label: string; url: string }[]; also?: string[] } }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }
  return (
    <div className="pr-item">
      <div>{item.platform && ICONS.has(item.platform) ? <PlatformIcon name={item.platform as Platform} size={24} /> : null}</div>
      <div className="pr-item-main">
        <span className="pr-item-title">{item.title}</span>
        {item.text && <div className="pr-item-body">{item.text}</div>}
        {!!item.files?.length && (
          <div className="pr-files">
            {item.files.map((f) => <a key={f.url} className="pr-btn pr-btn-sm" href={f.url} download target="_blank" rel="noopener noreferrer">↓ {f.label}</a>)}
            {item.also?.map((p) => ALSO[p] ? <a key={p} className="pr-btn pr-btn-ghost pr-btn-sm" href={ALSO[p]!.href} target="_blank" rel="noopener noreferrer">{Icon.external} {ALSO[p]!.label}</a> : null)}
          </div>
        )}
      </div>
      <div className="pr-item-act">
        <button className="pr-btn pr-btn-sm" onClick={copy}>{copied ? Icon.check : Icon.copy} {copied ? 'Copied' : 'Copy'}</button>
        {item.openUrl && <a className="pr-btn pr-btn-sm" href={item.openUrl} target="_blank" rel="noopener noreferrer">{Icon.external} Open</a>}
        <form action={markPosted}>
          <input type="hidden" name="ws" value={ws} />
          <input type="hidden" name="asset" value={item.id} />
          <Submit className="pr-btn pr-btn-primary pr-btn-sm" pending="Saving">{Icon.check} I posted it</Submit>
        </form>
      </div>
    </div>
  );
}
