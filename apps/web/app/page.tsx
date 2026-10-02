import { LaunchPage } from '@/components/space/launch-page';
import { site } from '@/lib/site';
import { getWaitlistStore } from '@/lib/waitlist';
import './space.css';
import './mac.css';
import './preloader.css';

// References: spacefs (two-tone headline), lovable + resend (one input, one button), raycast (dark hero,
// mono meta), cursor + attio (product UI as console), dub (mono stats), cal (pricing), gumroad (flat lime blocks).
export const revalidate = 60;

export default async function Home() {
  const stats = await getWaitlistStore()
    .stats(site.waitlistSlug)
    .catch(() => ({ total: 0, last7: 0, bySource: [] }));

  return (
    <>
      <noscript>
        <style>{'.space .prehide{visibility:visible!important}'}</style>
      </noscript>
      <LaunchPage stats={stats} />
    </>
  );
}
