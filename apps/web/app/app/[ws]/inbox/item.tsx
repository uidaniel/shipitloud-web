'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { Icon } from '@/components/app/icons';
import { Submit } from '@/components/app/ui';
import { decide, undo } from '../../actions';

export interface InboxAsset {
  id: string;
  type: string;
  platform: string | null;
  title: string;
  content: { text?: string; thread_url?: string; quote?: string; slots?: Record<string, string>; score_tips?: string[]; post_id?: string; subject?: string };
  file_url?: string | null;
  qa_score?: number | null;
  confidence: number | null;
  flags: string[];
  scheduled_for: string | null;
  expires_at: string | null;
  created_at: string;
}

const PLATFORM: Record<string, { icon: Platform; name: string }> = {
  x: { icon: 'x', name: 'X' }, linkedin: { icon: 'linkedin', name: 'LinkedIn' }, reddit: { icon: 'reddit', name: 'Reddit' },
  hn: { icon: 'hn', name: 'Hacker News' }, instagram: { icon: 'instagram', name: 'Instagram' }, tiktok: { icon: 'tiktok', name: 'TikTok' },
  email: { icon: 'email', name: 'Email' }, bluesky: { icon: 'bluesky', name: 'Bluesky' }, github: { icon: 'github', name: 'GitHub' },
  rss: { icon: 'rss', name: 'RSS' }, blog: { icon: 'rss', name: 'Blog' }, producthunt: { icon: 'producthunt', name: 'Product Hunt' }, indiehackers: { icon: 'indiehackers', name: 'Indie Hackers' },
};
const TYPE: Record<string, string> = { reply: 'Reply', post: 'Post', poster: 'Poster', video: 'Video', email: 'Email', article: 'Article', ad_creative: 'Ad' };

function when(iso: string, future: boolean) {
  const d = Date.parse(iso) - Date.now();
  const h = Math.round(Math.abs(d) / 3600_000);
  if (!future) return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (h < 1) return `${Math.max(1, Math.round(Math.abs(d) / 60_000))}m`;
  if (h < 48) return `${h}h`;
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Seconds the founder spent on this item, for the "under 15 minutes a day" metric. */
function useSecondsOnScreen() {
  const start = useRef(0);
  useEffect(() => { start.current = Date.now(); }, []);
  return () => Math.round((Date.now() - start.current) / 1000);
}

export function InboxItem({ ws, asset, threshold }: { ws: string; asset: InboxAsset; threshold: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(asset.content.text ?? '');
  const seconds = useSecondsOnScreen();
  const p = asset.platform ? PLATFORM[asset.platform] : undefined;
  const expiringSoon = asset.expires_at && Date.parse(asset.expires_at) - Date.now() < 3 * 3600_000;
  const hidden = (decision: string) => (
    <>
      <input type="hidden" name="ws" value={ws} />
      <input type="hidden" name="asset" value={asset.id} />
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="seconds" value={0} ref={(el) => { if (el) el.form?.addEventListener('submit', () => { el.value = String(seconds()); }, { once: true }); }} />
    </>
  );

  return (
    <article className="pr-item pr-fade-in">
      <div className="pr-item-ico">{p ? <PlatformIcon name={p.icon} size={24} /> : <span className="pr-chip">{TYPE[asset.type]}</span>}</div>
      <div className="pr-item-main">
        <div className="pr-item-h">
          <span className="pr-item-title">{asset.title}</span>
          {asset.flags.map((f) => <span key={f} className="pr-chip pr-chip-err">{f}</span>)}
        </div>
        <div className="pr-item-meta">
          <span>{TYPE[asset.type] ?? asset.type}{p && p.name !== TYPE[asset.type] ? ` · ${p.name}` : ''}</span>
          {asset.scheduled_for && <span>· Goes out in {when(asset.scheduled_for, true)}</span>}
          {asset.expires_at && <span className={expiringSoon ? 'pr-chip pr-chip-warn' : ''}>{expiringSoon ? `Expires in ${when(asset.expires_at, true)}` : `· Expires in ${when(asset.expires_at, true)}`}</span>}
          {asset.confidence != null && (
            <span className="pr-score" title="Quality and safety score from our checks">
              · Score <b style={{ color: asset.confidence >= threshold ? 'var(--ok)' : 'var(--warn)' }}>{asset.confidence}</b>
            </span>
          )}
          {asset.content.thread_url && (
            <a href={asset.content.thread_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>· View thread {Icon.external}</a>
          )}
        </div>

        {editing ? (
          <form action={decide} style={{ marginTop: 10 }}>
            {hidden('edit')}
            <label className="sr-only" htmlFor={`t-${asset.id}`}>Edit text</label>
            <textarea id={`t-${asset.id}`} name="text" className="pr-textarea" value={text} onChange={(e) => setText(e.target.value)} autoFocus rows={Math.min(12, Math.max(4, text.split('\n').length + 1))} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="pr-btn pr-btn-ghost pr-btn-sm" onClick={() => { setEditing(false); setText(asset.content.text ?? ''); }}>Cancel</button>
              <Submit className="pr-btn pr-btn-primary pr-btn-sm" pending="Saving…">{Icon.check} Save and approve</Submit>
            </div>
          </form>
        ) : (
          <>
            {asset.file_url && asset.type === 'video' && (
              <video className="pr-poster" src={`${asset.file_url}#t=3`} controls muted playsInline preload="metadata" />
            )}
            {asset.file_url && asset.type !== 'video' && (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={asset.file_url} target="_blank" rel="noopener noreferrer" className="pr-poster"><img src={asset.file_url} alt={asset.title} loading="lazy" /></a>
            )}
            {asset.type === 'email' && asset.content.subject && <p className="pr-email-subject"><span>Subject</span>{asset.content.subject}</p>}
            {asset.content.quote && <blockquote className="pr-quote">{asset.content.quote}</blockquote>}
            {asset.content.text && <div className="pr-item-body">{asset.content.text}</div>}
            {!!asset.content.score_tips?.length && <p className="pr-hint" style={{ margin: '8px 0 0' }}>Tip: {asset.content.score_tips[0]}</p>}
          </>
        )}
      </div>

      {!editing && (
        <div className="pr-item-act">
          <form action={decide}>{hidden('reject')}<Submit className="pr-btn pr-btn-ghost pr-btn-sm" title="Reject">{Icon.x}<span className="sr-only">Reject</span></Submit></form>
          {asset.type === 'article' && asset.content.post_id
            ? <Link className="pr-btn pr-btn-sm" href={`/app/${ws}/blog/${asset.content.post_id}`}>{Icon.edit} Read article</Link>
            : <button className="pr-btn pr-btn-sm" onClick={() => setEditing(true)}>{Icon.edit} Edit</button>}
          <form action={decide}>{hidden('approve')}<Submit className="pr-btn pr-btn-primary pr-btn-sm" pending="Approving">{Icon.check} Approve</Submit></form>
        </div>
      )}
    </article>
  );
}

export function UndoRow({ ws, asset }: { ws: string; asset: { id: string; type: string; platform: string | null; title: string; undo_until: string } }) {
  const [left, setLeft] = useState(() => Math.max(0, Date.parse(asset.undo_until) - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Date.parse(asset.undo_until) - Date.now())), 1000);
    return () => clearInterval(t);
  }, [asset.undo_until]);
  if (!left) return null;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const p = asset.platform ? PLATFORM[asset.platform] : undefined;
  return (
    <div className="pr-item" style={{ alignItems: 'center' }}>
      <div>{p ? <PlatformIcon name={p.icon} size={22} /> : null}</div>
      <div className="pr-item-main">
        <span className="pr-chip pr-chip-violet" style={{ marginRight: 8 }}>Auto-approved</span>
        <span style={{ fontWeight: 500 }}>{asset.title}</span>
        <div className="pr-item-meta">Trust mode approved this. You can pull it back for {m}:{String(s).padStart(2, '0')}.</div>
      </div>
      <form action={undo} className="pr-item-act">
        <input type="hidden" name="ws" value={ws} />
        <input type="hidden" name="asset" value={asset.id} />
        <Submit className="pr-btn pr-btn-sm" pending="Undoing">{Icon.undo} Undo</Submit>
      </form>
    </div>
  );
}
