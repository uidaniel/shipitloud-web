import { LaunchPage } from '@/components/space/launch-page';
import { site } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase/server';
import './space.css';
import './mac.css';

// References: spacefs (two-tone headline), lovable + resend (one input, one button), raycast (dark hero,
// mono meta), cursor + attio (product UI as console), dub (mono stats), cal (pricing), gumroad (flat lime blocks).
export const revalidate = 60;

// The self-launch counter (PRD v5): free setups started after launch, not prelaunch emails.
async function setups() {
  if (!site.launch.live) return { total: 0, last7: 0, bySource: [] };
  const db = supabaseAdmin();
  const since = site.launch.date ? `${site.launch.date}T00:00:00Z` : '2000-01-01T00:00:00Z';
  const own = (await db.from('waitlist_pages').select('workspace_id').eq('slug', site.waitlistSlug).maybeSingle()).data?.workspace_id ?? '00000000-0000-0000-0000-000000000000';
  const count = async (from: string) => (await db.from('workspaces').select('id', { count: 'exact', head: true }).neq('id', own).gte('created_at', from)).count ?? 0;
  return { total: await count(since), last7: await count(new Date(Date.now() - 7 * 86_400_000).toISOString()), bySource: [] as { source: string; count: number }[] };
}

export default async function Home() {
  const stats = await setups().catch(() => ({ total: 0, last7: 0, bySource: [] }));

  return (
    <>
      <noscript>
        <style>{'.space .prehide{visibility:visible!important}'}</style>
      </noscript>
      <LaunchPage stats={stats} />
    </>
  );
}
