import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireWorkspace } from '@/lib/supabase/server';
import { Sidebar } from './sidebar';

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, user, ws } = await requireWorkspace(id);
  const period = new Date().toISOString().slice(0, 7) + '-01';

  const [pending, usage, limits, notes, subRes, delRes] = await Promise.all([
    sb.from('assets').select('id', { count: 'exact', head: true }).eq('workspace_id', id).eq('status', 'pending'),
    sb.from('usage').select('videos, images, ai_drafts').eq('workspace_id', id).eq('period', period).maybeSingle(),
    sb.from('plan_limits').select('metric, monthly_cap').eq('plan', ws.plan),
    sb.from('notifications').select('id, title, body, url, read_at, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(15),
    sb.from('subscriptions').select('status, trial_ends_at').eq('workspace_id', id).maybeSingle(),
    sb.from('deletion_requests').select('scheduled_for').eq('workspace_id', id).is('cancelled_at', null).is('completed_at', null).maybeSingle(),
  ]);
  // Dunning banner on every page; a gentle one in the last 2 days of a trial (PRD sections 24 and 25).
  const sub = subRes.data;
  const trialLeft = sub?.status === 'trialing' && sub.trial_ends_at ? Math.ceil((Date.parse(sub.trial_ends_at) - Date.now()) / 86_400_000) : null;
  const del = delRes.data;
  const banner = del
    ? <div className="pr-banner pr-banner-err pr-top-banner"><span><b>This workspace will be deleted on {new Date(del.scheduled_for).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</b> Changed your mind? You can keep it until then.</span><Link className="pr-btn pr-btn-sm" href={`/app/${id}/settings`}>Keep it</Link></div>
    : sub?.status === 'past_due'
    ? <div className="pr-banner pr-banner-err pr-top-banner"><span><b>Your payment didn’t go through.</b> Update your card to keep everything running.</span><Link className="pr-btn pr-btn-sm" href={`/app/${id}/billing`}>Update card</Link></div>
    : trialLeft != null && trialLeft <= 2
      ? <div className="pr-banner pr-banner-info pr-top-banner"><span>Your Grow trial ends in {trialLeft} day{trialLeft === 1 ? '' : 's'}. Nothing to do if you’re staying.</span><Link className="pr-btn pr-btn-sm" href={`/app/${id}/billing`}>Billing</Link></div>
      : null;

  const mini = (await cookies()).get('sil_side')?.value === 'mini';
  const cap = (m: string) => limits.data?.find((l) => l.metric === m)?.monthly_cap ?? null;
  const meter = (['ai_drafts', 'images', 'videos'] as const).map((m) => ({
    label: m === 'ai_drafts' ? 'AI drafts' : m === 'images' ? 'Images' : 'Videos',
    used: (usage.data as Record<string, number> | null)?.[m] ?? 0,
    cap: cap(m),
  }));

  return (
    <Sidebar
        ws={{ id, name: ws.product_name, plan: ws.plan, fit: ws.fit }}
        pending={pending.count ?? 0}
        meter={meter}
        email={user.email ?? ''}
        notifications={notes.data ?? []}
        mini={mini}
      >
        {banner}
        {children}
      </Sidebar>
  );
}
