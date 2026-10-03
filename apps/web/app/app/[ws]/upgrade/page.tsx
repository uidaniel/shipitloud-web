import type { Metadata } from 'next';
import Link from 'next/link';
import { FREE_LEADS_PER_WEEK, FREE_WINS } from '@shipitloud/engine';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { Spark } from '@/components/app/bento';
import { plans } from '@/lib/site';
import { startCheckout } from '../../billing-actions';

export const metadata: Metadata = { title: 'Unlock everything' };

// The paywall (PRD section 24): shown at the moment the work becomes ongoing, with the founder's own numbers.
const WHY: Record<string, string> = {
  leads: 'See every conversation, with replies drafted for you.',
  wins: `You’ve used your ${FREE_WINS} free first wins.`,
  week: 'Schedule the whole week and let it run.',
  video: 'Render your full demo video.',
  digest: 'Get your weekly digest every Monday.',
  channel: 'Connect more than one channel.',
};

export default async function Upgrade({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ reason?: string; error?: string }> }) {
  const { ws: id } = await params;
  const { reason = 'leads', error } = await searchParams;
  const { sb, ws } = await requireWorkspace(id);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ count: leads }, { count: drafts }, { data: kit }, { data: sub }] = await Promise.all([
    sb.from('mentions').select('id', { count: 'exact', head: true }).eq('workspace_id', id).gte('score', 60).neq('status', 'dismissed').gte('created_at', since),
    sb.from('assets').select('id', { count: 'exact', head: true }).eq('workspace_id', id).in('status', ['pending', 'approved']).in('type', ['post', 'reply', 'poster']),
    sb.from('assets').select('id').eq('workspace_id', id).eq('type', 'video').limit(1),
    sb.from('subscriptions').select('workspace_id').eq('workspace_id', id).maybeSingle(),
  ]);
  const locked = Math.max(0, (leads ?? 0) - FREE_LEADS_PER_WEEK);
  const firstTrial = !sub;
  const grow = plans.find((p) => p.id === 'grow')!;
  const lp = plans.find((p) => p.id === 'launch_pass')!;
  const prelaunch = ws.fit === 'launching_soon';

  // "Unlock 47 conversations, schedule 12 posts, render your demo video."
  const bits = [
    locked > 0 ? `unlock ${locked} conversation${locked === 1 ? '' : 's'}` : 'find people asking for what you built',
    (drafts ?? 0) > 0 ? `schedule ${drafts} post${drafts === 1 ? '' : 's'}` : 'get a fresh week of posts every Sunday',
    kit?.length ? 'render your demo video' : 'get your demo video',
  ];
  const headline = bits.join(', ').replace(/^./, (c) => c.toUpperCase());

  if (ws.plan !== 'free') {
    return (
      <div className="pr-body">
        <div className="pr-page-h"><h1 className="pr-h1">You’re all set</h1><p className="pr-lead">Everything is unlocked on your plan.</p></div>
        <Link className="pr-btn pr-btn-primary" href={`/app/${id}/billing`}>See billing</Link>
      </div>
    );
  }

  return (
    <div className="pr-body pw">
      {error && <div className="pr-banner pr-banner-err" role="alert"><span>{error}</span></div>}
      <section className="pw-hero">
        <Spark className="spark" />
        <span className="k">{WHY[reason] ?? WHY.leads}</span>
        <h1>{headline}.</h1>
        <p>{firstTrial ? `Grow is free for 7 days. We remind you 2 days before it ends, and you can cancel in one click.` : 'Pick up right where you left off.'}</p>
        {locked > 0 && <div className="pw-locked"><b>{locked}</b> people are asking for what you built. They’re found; your replies are one click away.</div>}
      </section>

      <div className="pw-plans">
        <form action={startCheckout} className="pw-plan is-hero">
          <input type="hidden" name="ws" value={id} /><input type="hidden" name="plan" value="grow" />
          <div className="pw-plan-h"><b>Grow</b><span className="pw-badge">Recommended</span></div>
          <div className="pw-price"><b>${grow.price.USD}</b><span>/month{firstTrial ? ' after 7 days free' : ''}</span></div>
          <ul>{['Every warm lead, with drafted replies', 'Posts scheduled all week, in your voice', 'Demo videos, carousels and the SEO blog', 'Weekly digest and trust mode'].map((f) => <li key={f}><i>{Icon.check}</i>{f}</li>)}</ul>
          <Submit className="pw-go" pending="Opening checkout…">{firstTrial ? 'Start 7 days free' : 'Continue with Grow'} <i>{Icon.arrow}</i></Submit>
          <small>Card required. Nothing is charged today. Cancel any time.</small>
        </form>
        {prelaunch && (
          <form action={startCheckout} className="pw-plan">
            <input type="hidden" name="ws" value={id} /><input type="hidden" name="plan" value="launch_pass" />
            <div className="pw-plan-h"><b>Launch Pass</b><span className="pw-badge soft">One-time</span></div>
            <div className="pw-price"><b>${lp.price.USD}</b><span>once</span></div>
            <ul>{lp.features.slice(0, 4).map((f) => <li key={f}><i>{Icon.check}</i>{f}</li>)}</ul>
            <Submit className="pr-btn pr-btn-lg" pending="Opening checkout…">Get the Launch Pass</Submit>
            <small>For your launch month. No subscription.</small>
          </form>
        )}
      </div>
      <p className="pw-foot">Not now? <Link href={`/app/${id}`}>Keep using Free</Link>: your plan and assets stay, and {FREE_LEADS_PER_WEEK} warm leads a week keep coming.</p>
    </div>
  );
}
