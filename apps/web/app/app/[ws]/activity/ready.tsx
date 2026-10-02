'use client';

import { useState } from 'react';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { Icon } from '@/components/app/icons';
import { Submit } from '@/components/app/ui';
import { markPosted } from '../../actions';

const ICONS = new Set(['x', 'linkedin', 'reddit', 'hn', 'instagram', 'tiktok', 'email']);

export function ReadyToPost({ ws, item }: { ws: string; item: { id: string; title: string; platform: string | null; text: string; openUrl: string | null } }) {
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
