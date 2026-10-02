'use client';

import { useState } from 'react';
import { Icon } from '@/components/app/icons';

export function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="pr-btn pr-btn-ghost pr-btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* clipboard blocked */ } }}>
      {done ? Icon.check : Icon.copy} {done ? 'Copied' : 'Copy'}
    </button>
  );
}
