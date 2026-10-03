import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { Tiles } from '@/components/app/bento';
import { CopyButton } from '../analytics/parts';
import { billingMode, type Sub } from '@/lib/billing';
import { plans } from '@/lib/site';
import { openPortal, pauseSubscription, referralCode, resumeSubscription, testEvent } from '../../billing-actions';

export const metadata: Metadata = { title: 'Billing' };

const PLAN: Record<string, string> = { free: 'Free', launch_pass: 'Launch Pass', grow: 'Grow', scale: 'Scale' };
const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '–');
const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000)) : 0);
const NOTICE: Record<string, string> = {
  welcome: 'You’re in. Everything is unlocked.',
  cancelled: 'Cancelled. Nothing more will be charged. You’re on the Free plan with your plan and assets saved.',
  paused: 'Paused. Nothing is charged until it resumes.',
  pause_1m: 'Paused for a month. It picks up again on its own.',
  strategy_reset: 'Strategy reset started: a fresh analysis and channel plan are on their way.',
  trust_mode: 'Trust mode is on. Safe, high-scoring posts now go out on their own.',
  downgrade_free: 'You’re on the Free plan. Your waitlist page, plan and assets stay.',
};

export default async function Billing({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: id } = await params;
  const q = await searchParams;
  const { sb, ws } = await requireWorkspace(id);
  const [{ data: subRow }, { data: refs }, code] = await Promise.all([
    sb.from('subscriptions').select('*').eq('workspace_id', id).maybeSingle(),
    sb.from('referrals').select('status').eq('referrer_workspace_id', id),
    referralCode(id),
  ]);
  const sub = subRow as Sub | null;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const refUrl = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}/signup?ref=${code}`;
  const price = plans.find((p) => p.id === ws.plan)?.price.USD ?? 0;
  const status = sub?.status ?? 'free';
  const live = sub && ['trialing', 'active', 'past_due', 'paused'].includes(sub.status);
  const notice = NOTICE[q.offer ?? ''] ?? (q.welcome ? NOTICE.welcome : q.cancelled ? NOTICE.cancelled : q.paused ? NOTICE.paused : null);

  const next = sub?.status === 'trialing' ? { label: 'Trial ends', value: date(sub.trial_ends_at), sub: `${daysLeft(sub.trial_ends_at)} days left · then $${price}/month` }
    : sub?.status === 'paused' ? { label: 'Resumes', value: date(sub.paused_until), sub: 'nothing charged until then' }
    : sub?.status === 'past_due' ? { label: 'Payment', value: 'Failed', sub: 'we retry for 7 days' }
    : sub?.plan === 'launch_pass' && live ? { label: 'Launch Pass until', value: date(sub.current_period_end), sub: 'then the Free plan' }
    : live ? { label: 'Renews', value: date(sub!.current_period_end), sub: `$${price}/month` }
    : { label: 'Next charge', value: 'None', sub: 'you’re on Free' };

  return (
    <div className="pr-body" style={{ maxWidth: 980 }}>
      <div className="pr-page-h"><h1 className="pr-h1">Billing</h1><p className="pr-lead">Your plan, your card, and a free month for every founder you bring.</p></div>
      {notice && <div className="pr-banner pr-banner-info pr-fade-in" role="status" style={{ marginBottom: 18 }}><span>{notice}</span></div>}
      {sub?.status === 'past_due' && (
        <div className="pr-banner pr-banner-err" style={{ marginBottom: 18 }}><span><b>Your last payment failed.</b> Update your card and we’ll retry. After 7 days the workspace moves to Free, with nothing deleted.</span>
          <form action={openPortal}><input type="hidden" name="ws" value={id} /><Submit className="pr-btn pr-btn-sm" pending="Opening…">Update card</Submit></form></div>
      )}

      <Tiles items={[
        { label: 'Your plan', value: PLAN[ws.plan] ?? ws.plan, text: true, tone: 'violet', sub: status === 'trialing' ? 'free trial' : status === 'free' ? 'no card on file' : status.replace('_', ' ') },
        { label: next.label, value: next.value, text: true, tone: 'mesh', sub: next.sub },
        { label: 'Referrals', value: (refs ?? []).filter((r) => r.status === 'rewarded').length, unit: ` / ${(refs ?? []).length}`, tone: 'lime', sub: 'free months earned' },
      ]} />

      <div className="bl-grid">
        <section className="pr-section">
          <div className="pr-section-h"><h2>Your plan</h2><p>{ws.plan === 'free' && sub?.status !== 'paused' ? 'Free keeps your waitlist page, 5 posters a month and 3 warm leads a week.' : 'Change, pause or cancel any time. No calls, no hidden steps.'}</p></div>
          <div className="pr-section-b bl-actions">
            {ws.plan === 'free' && sub?.status !== 'paused' ? (
              <Link className="pr-btn pr-btn-primary" href={`/app/${id}/upgrade`}>{sub ? 'Choose a plan' : 'Start Grow free for 7 days'}</Link>
            ) : (
              <>
                {sub?.customer_id && billingMode() === 'dodo' && <form action={openPortal}><input type="hidden" name="ws" value={id} /><Submit className="pr-btn" pending="Opening…">Card and invoices</Submit></form>}
                {sub?.status === 'paused' ? (
                  <form action={resumeSubscription}><input type="hidden" name="ws" value={id} /><Submit className="pr-btn pr-btn-primary" pending="Resuming…">Resume now</Submit></form>
                ) : sub && ['active', 'trialing'].includes(sub.status) && sub.plan !== 'launch_pass' ? (
                  <form action={pauseSubscription} className="bl-pause">
                    <input type="hidden" name="ws" value={id} />
                    <Submit className="pr-btn" name="months" value="1" pending="Pausing…">Pause 1 month</Submit>
                    <Submit className="pr-btn" name="months" value="2" pending="Pausing…">Pause 2 months</Submit>
                  </form>
                ) : null}
                {ws.plan === 'grow' && <Link className="pr-btn" href={`/app/${id}/upgrade?reason=scale`}>See Scale</Link>}
                {live && sub!.plan !== 'launch_pass' && <Link className="pr-btn pr-btn-ghost bl-cancel" href={`/app/${id}/billing/cancel`}>Cancel plan</Link>}
              </>
            )}
          </div>
        </section>

        <section className="pr-section">
          <div className="pr-section-h"><h2>Give a month, get a month</h2><p>A founder you refer gets their first month of Grow free. When they pay for the first time, you get a month free.</p></div>
          <div className="pr-section-b">
            <div className="pr-code-row"><code>{refUrl}</code><CopyButton text={refUrl} /></div>
          </div>
        </section>
      </div>

      {billingMode() === 'simulator' && sub && (
        <section className="pr-section bl-test">
          <div className="pr-section-h"><h2>Test mode</h2><p>Payments are simulated until Dodo is connected. Try what happens at the end of the trial or when a card fails.</p></div>
          <div className="pr-section-b bl-actions">
            {(['payment.succeeded', 'payment.failed', 'subscription.renewed'] as const).map((t) => (
              <form key={t} action={testEvent}><input type="hidden" name="ws" value={id} /><input type="hidden" name="type" value={t} /><Submit className="pr-btn pr-btn-sm" pending="…">{t === 'payment.succeeded' ? 'Trial ends: card charged' : t === 'payment.failed' ? 'Card fails' : 'Renews'}</Submit></form>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
