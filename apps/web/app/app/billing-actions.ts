'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CANCEL_REASONS, offerFor, type CancelReason, type PaidPlan } from '@shipitloud/engine';
import { requireWorkspace, supabaseAdmin } from '@/lib/supabase/server';
import { billingMode, cancelNow, checkoutUrl, keepPlan, pause, portalUrl, resume, simulate } from '@/lib/billing';

const str = (v: FormDataEntryValue | null, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const PLANS: PaidPlan[] = ['grow', 'scale', 'launch_pass'];
const DAY = 86_400_000;

async function origin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
}

/** Start Grow (7-day trial), Scale or a Launch Pass: off to checkout. */
export async function startCheckout(form: FormData) {
  const ws = str(form.get('ws'));
  const plan = PLANS.find((p) => p === form.get('plan'));
  const { user } = await requireWorkspace(ws);
  if (!plan) redirect(`/app/${ws}/upgrade`);
  let url: string;
  try {
    url = await checkoutUrl({ ws, plan, email: user.email ?? '', origin: await origin() });
  } catch (err) {
    redirect(`/app/${ws}/upgrade?error=${encodeURIComponent(err instanceof Error ? err.message : 'Checkout is unavailable')}`);
  }
  redirect(url);
}

/** Test mode only: the pretend checkout succeeds and the same webhook processor runs. */
export async function testCheckout(form: FormData) {
  const ws = str(form.get('ws'));
  const plan = PLANS.find((p) => p === form.get('plan'));
  await requireWorkspace(ws);
  if (billingMode() !== 'simulator' || !plan) redirect(`/app/${ws}/upgrade`);
  const admin = supabaseAdmin();
  const trial = Math.max(0, Math.min(30, Number(form.get('trial')) || 0));
  if (plan === 'launch_pass') await simulate(admin, ws, plan, 'payment.succeeded');
  else await simulate(admin, ws, plan, 'subscription.active', { trial_period_days: trial, next_billing_date: new Date(Date.now() + (trial || 30) * DAY).toISOString() });
  revalidatePath(`/app/${ws}`, 'layout');
  redirect(`/app/${ws}/billing?welcome=1`);
}

/** Test mode only: fast-forward billing events to try the trial end, failed payments and dunning. */
export async function testEvent(form: FormData) {
  const ws = str(form.get('ws'));
  const type = str(form.get('type'));
  await requireWorkspace(ws);
  if (billingMode() !== 'simulator') return;
  const admin = supabaseAdmin();
  const { data: sub } = await admin.from('subscriptions').select('plan').eq('workspace_id', ws).maybeSingle();
  if (!sub || !['payment.succeeded', 'payment.failed', 'subscription.renewed'].includes(type)) return;
  await simulate(admin, ws, sub.plan as PaidPlan, type, { next_billing_date: new Date(Date.now() + 30 * DAY).toISOString() });
  revalidatePath(`/app/${ws}`, 'layout');
}

export async function keepSubscription(form: FormData) {
  const ws = str(form.get('ws'));
  await requireWorkspace(ws);
  await keepPlan(ws);
  revalidatePath(`/app/${ws}`, 'layout');
  redirect(`/app/${ws}/billing`);
}

export async function openPortal(form: FormData) {
  const ws = str(form.get('ws'));
  await requireWorkspace(ws);
  const { data: sub } = await supabaseAdmin().from('subscriptions').select('customer_id').eq('workspace_id', ws).maybeSingle();
  const url = sub?.customer_id ? await portalUrl(sub.customer_id) : null;
  redirect(url ?? `/app/${ws}/billing?portal=unavailable`);
}

export async function pauseSubscription(form: FormData) {
  const ws = str(form.get('ws'));
  await requireWorkspace(ws);
  await pause(ws, form.get('months') === '2' ? 2 : 1);
  revalidatePath(`/app/${ws}`, 'layout');
  redirect(`/app/${ws}/billing?paused=1`);
}

export async function resumeSubscription(form: FormData) {
  const ws = str(form.get('ws'));
  await requireWorkspace(ws);
  await resume(ws);
  revalidatePath(`/app/${ws}`, 'layout');
  redirect(`/app/${ws}/billing`);
}

/**
 * Cancellation (PRD section 25): one click plus an optional reason. If the reason has an offer and the founder
 * hasn't seen one before, it's shown once; declining cancels immediately. Otherwise it cancels at once.
 */
export async function cancelSubscription(form: FormData) {
  const ws = str(form.get('ws'));
  const { ws: w } = await requireWorkspace(ws);
  const admin = supabaseAdmin();
  const step = str(form.get('step'));
  const reason = CANCEL_REASONS.find((r) => r.id === form.get('reason'))?.id ?? null;
  const comment = str(form.get('comment'), 1000) || null;

  if (step === 'start') {
    const { count: shownBefore } = await admin.from('cancellations').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).not('offer_shown', 'is', null);
    const offer = shownBefore ? null : offerFor(reason as CancelReason | null, { trustOn: w.trust_mode !== 'manual' });
    const { data: c } = await admin.from('cancellations').insert({ workspace_id: ws, reason, comment, offer_shown: offer?.id ?? null }).select('id').single();
    if (offer && c) redirect(`/app/${ws}/billing/cancel?offer=${offer.id}&c=${c.id}`);
    await cancelNow(ws);
    if (c) await admin.from('cancellations').update({ cancelled_at: new Date().toISOString() }).eq('id', c.id);
    revalidatePath(`/app/${ws}`, 'layout');
    redirect(`/app/${ws}/billing?cancelled=1`);
  }

  const cId = str(form.get('c'));
  const { data: c } = await admin.from('cancellations').select('id, offer_shown').eq('id', cId).eq('workspace_id', ws).maybeSingle();
  if (step === 'accept' && c?.offer_shown) {
    await admin.from('cancellations').update({ offer_accepted: true }).eq('id', c.id);
    if (c.offer_shown === 'pause_1m') await pause(ws, 1);
    if (c.offer_shown === 'trust_mode') await admin.from('workspaces').update({ trust_mode: 'trust' }).eq('id', ws);
    if (c.offer_shown === 'strategy_reset') await admin.rpc('enqueue_job', { p_workspace: ws, p_type: 'setup.analyze', p_payload: { rerun: true }, p_run_at: new Date().toISOString(), p_key: `reset:${c.id}` });
    if (c.offer_shown === 'downgrade_free') await cancelNow(ws);
    revalidatePath(`/app/${ws}`, 'layout');
    redirect(`/app/${ws}/billing?offer=${c.offer_shown}`);
  }
  // Declined: cancel right away.
  await cancelNow(ws);
  if (c) await admin.from('cancellations').update({ cancelled_at: new Date().toISOString() }).eq('id', c.id);
  revalidatePath(`/app/${ws}`, 'layout');
  redirect(`/app/${ws}/billing?cancelled=1`);
}

/** The founder's referral link: created on first view. */
export async function referralCode(ws: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data } = await admin.from('workspaces').select('referral_code, product_name').eq('id', ws).single();
  if (data?.referral_code) return data.referral_code;
  const slug = (data?.product_name ?? 'friend').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10) || 'friend';
  for (let i = 0; i < 5; i++) {
    const code = `${slug}${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await admin.from('workspaces').update({ referral_code: code }).eq('id', ws).is('referral_code', null);
    if (!error) return code;
  }
  throw new Error('Couldn’t create a referral code');
}
