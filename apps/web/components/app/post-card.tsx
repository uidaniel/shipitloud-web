import Link from 'next/link';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { decide } from '@/app/app/actions';

// A draft shown the way it will look once posted: the founder's logo and name, the platform's mark,
// the full text, and Skip / Edit / Approve. Always a white card, like the real thing, on light or dark pages.

export const PLATFORM: Record<string, string> = { x: 'X', linkedin: 'LinkedIn', bluesky: 'Bluesky', reddit: 'Reddit', threads: 'Threads', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', whatsapp: 'WhatsApp', email: 'Email', hackernews: 'Hacker News', hn: 'Hacker News', producthunt: 'Product Hunt', github: 'GitHub' };
const ICON: Record<string, Platform> = { x: 'x', linkedin: 'linkedin', bluesky: 'bluesky', reddit: 'reddit', instagram: 'instagram', tiktok: 'tiktok', email: 'email', hackernews: 'hn', hn: 'hn', producthunt: 'producthunt', github: 'github' };
const TINT: Record<string, string> = { whatsapp: '#25d366', threads: '#000', facebook: '#1877f2' };

export function PlatformMark({ platform, size = 26 }: { platform: string | null; size?: number }) {
  const p = platform ?? '';
  if (ICON[p]) return <span className="post-mark" title={PLATFORM[p]}><PlatformIcon name={ICON[p]} size={size} /></span>;
  return <span className="post-mark post-mark-txt" style={{ width: size, height: size, background: TINT[p] ?? '#5b5b66' }} title={PLATFORM[p] ?? 'Any channel'}>{(PLATFORM[p] ?? '•').slice(0, 1)}</span>;
}

export function PostCard({ ws, id, name, handle, logo, platform, type, text }: {
  ws: string; id: string; name: string; handle: string; logo: string | null; platform: string | null; type: string; text: string;
}) {
  const hidden = <><input type="hidden" name="ws" value={ws} /><input type="hidden" name="asset" value={id} /></>;
  return (
    <li className="post-card">
      <div className="post-card-h">
        {logo ? <img src={logo} alt="" width={36} height={36} /> : <span className="post-card-av">{name.slice(0, 1).toUpperCase()}</span>}
        <div><b>{name}</b><small>@{handle}</small></div>
        <PlatformMark platform={platform} />
      </div>
      <p>{text}</p>
      <div className="post-card-f">
        <span>{type === 'reply' ? 'Reply' : 'Post'} · {PLATFORM[platform ?? ''] ?? 'Any channel'}</span>
        <div>
          <form action={decide}>{hidden}<input type="hidden" name="decision" value="reject" /><Submit className="post-btn" pending="…" title="Skip this draft">Skip</Submit></form>
          <Link href={`/app/${ws}/inbox`} className="post-btn">Edit</Link>
          <form action={decide}>{hidden}<input type="hidden" name="decision" value="approve" /><Submit className="post-btn post-btn-ok" pending="…">{Icon.check} Approve</Submit></form>
        </div>
      </div>
    </li>
  );
}

/** The handle shown on a draft: the product's domain name, e.g. rajlo.com → @rajlo. */
export const handleOf = (url: string | null | undefined, name: string) => (url ?? '').replace(/^https?:\/\/(www\.)?/, '').split(/[./]/)[0] || name.toLowerCase().replace(/\s+/g, '');
