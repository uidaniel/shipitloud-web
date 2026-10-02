'use client';

import { useEffect } from 'react';

/** Counts a view once per page load. Runs only in real browsers, so most bots aren't counted. No cookies. */
export function ViewBeacon({ postId }: { postId: string }) {
  useEffect(() => {
    const key = `bl-v-${postId}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
    const body = JSON.stringify({ post: postId });
    if (!navigator.sendBeacon?.('/api/blog/view', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/blog/view', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  }, [postId]);
  return null;
}
