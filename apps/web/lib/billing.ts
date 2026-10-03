import { applyEvent, referralCheck, TRIAL_DAYS, type BillingEvent, type PaidPlan, type SubStatus } from '@shipitloud/engine';
import { supabaseAdmin } from '@/lib/supabase/server';

// Billing I/O (PRD sections 24 and 25). Dodo Payments when DODO_API_KEY is set; otherwise a test-mode simulator
// that feeds the same webhook processor, so the whole flow can be tried before the Dodo account is approved.

type Admin = ReturnType<typeof supabaseAdmin>;
const DAY = 86_400_000;

export const billingMode = (): 'dodo' | 'simulator' | 'off' =>
  process.env.DODO_API_KEY ? 'dodo' : process.env.NODE_ENV !== 'production' || process.env.BILLING_SIMULATOR === '1' ? 'simulator' : 'off';

export const products = (): Partial<Record<PaidPlan, string>> => ({
  grow: process.env.DODO_PRODUCT_GROW, scale: process.env.DODO_PRODUCT_SCALE, launch_pass: process.env.DODO_PRODUCT_LAUNCH_PASS,
});

const dodoBase = () => (process.env.DODO_MODE === 'live' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com');
async function dodo<T>(path: string, method: 'POST' | 'PATCH' | 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${dodoBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.DODO_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Dodo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export interface Sub {
  workspace_id: string; plan: PaidPlan; status: SubStatus; provider: 'dodo' | 'simulator'; provider_id: string | null; customer_id: string | null;
  trial_ends_at: string | null; current_period_end: string | null; cancel_at_period_end: boolean; paused_until: string | null;
  past_due_since: string | null; first_paid_at: string | null; reminded_at: string | null;
}

/** One trial per workspace: a workspace that ever had a subscription starts paying straight away. */
async function trialDays(admin: Admin, ws: string, plan: PaidPlan): Promise<number> {
  if (plan !== 'grow') return 0;
  const { data } = await admin.from('subscriptions').select('workspace_id').eq('workspace_id', ws).maybeSingle();
  if (data) return 0;
  // Referred founders get their first month of Grow free (PRD section 25).
  const { data: w } = await admin.from('workspaces').select('referred_by').eq('id', ws).single();
  return w?.referred_by ? 30 : TRIAL_DAYS;
}

/** Where to send the founder to pay: Dodo's hosted checkout, or the test checkout page. */
export async function checkoutUrl(o: { ws: string; plan: PaidPlan; email: string; origin: string }): Promise<string> {
  const mode = billingMode();
  if (mode === 'off') throw new Error('Payments open soon.');
  const admin = supabaseAdmin();
  const trial = await trialDays(admin, o.ws, o.plan);
  if (mode === 'simulator') return `/app/${o.ws}/billing/checkout?plan=${o.plan}&trial=${trial}`;
  const product = products()[o.plan];
  if (!product) throw new Error(`No Dodo product configured for ${o.plan}.`);
  const r = await dodo<{ checkout_url?: string }>('/checkouts', 'POST', {
    product_cart: [{ product_id: product, quantity: 1 }],
    customer: { email: o.email },
    return_url: `${o.origin}/app/${o.ws}/billing?welcome=1`,
    metadata: { workspace_id: o.ws, plan: o.plan },
    ...(o.plan !== 'launch_pass' ? { subscription_data: { trial_period_days: trial } } : {}),
  });
  if (!r.checkout_url) throw new Error('Dodo returned no checkout link.');
  return r.checkout_url;
}

/** Card and invoices: Dodo's customer portal. */
export async function portalUrl(customerId: string): Promise<string | null> {
  if (billingMode() !== 'dodo' || !customerId) return null;
  const r = await dodo<{ link?: string }>(`/customers/${customerId}/customer-portal/session`, 'POST');
  return r.link ?? null;
}

// ---------------------------------------------------------------- webhook processing (shared by Dodo and the simulator)
export async function processEvent(admin: Admin, id: string, e: BillingEvent): Promise<'ok' | 'duplicate' | 'ignored'> {
  const { error: dup } = await admin.from('billing_events').insert({ id, type: e.type, payload: e as unknown as Record<string, unknown>, workspace_id: typeof e.data.metadata?.workspace_id === 'string' ? e.data.metadata.workspace_id : null });
  if (dup) {
    // Already processed (Dodo retries); a failed earlier attempt is processed again.
    const { data: prev } = await admin.from('billing_events').select('processed_at').eq('id', id).maybeSingle();
    if (prev?.processed_at) return 'duplicate';
  }
  try {
    const wsId = typeof e.data.metadata?.workspace_id === 'string' ? e.data.metadata.workspace_id : null;
    const { data: prev } = wsId ? await admin.from('subscriptions').select('*').eq('workspace_id', wsId).maybeSingle() : { data: null };
    const patch = applyEvent(e, prev as Sub | null, products());
    if (!patch) {
      await admin.from('billing_events').update({ processed_at: new Date().toISOString() }).eq('id', id);
      return 'ignored';
    }
    const { workspacePlan, ...row } = patch;
    const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
    const keepCancel = !!(prev as Sub | null)?.cancel_at_period_end && patch.status === 'active';
    await admin.from('subscriptions').upsert({ ...clean, provider: (prev as Sub | null)?.provider ?? (id.startsWith('sim_') ? 'simulator' : 'dodo'), cancel_at_period_end: keepCancel, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
    const { data: before } = await admin.from('workspaces').select('plan, owner_id').eq('id', patch.workspace_id).single();
    await admin.from('workspaces').update({ plan: workspacePlan }).eq('id', patch.workspace_id);

    // Side effects of the change.
    const became = (p: string) => before?.plan !== p && workspacePlan === p;
    if (workspacePlan !== 'free' && before?.plan === 'free') {
      // Items approved on Free beyond the 3 first wins were held; now they go out.
      const { data: held } = await admin.from('assets').select('id').eq('workspace_id', patch.workspace_id).eq('status', 'approved').limit(50);
      for (const a of held ?? []) await admin.rpc('enqueue_job', { p_workspace: patch.workspace_id, p_type: 'asset.decided', p_payload: { asset_id: a.id }, p_run_at: new Date().toISOString(), p_key: `decided:${a.id}:upgrade` });
      await notify(admin, patch.workspace_id, 'billing', patch.status === 'trialing' ? 'Your Grow trial has started' : `You’re on ${PLAN_NAME[workspacePlan]}`, patch.status === 'trialing' ? `Free until ${fmtDate(patch.trial_ends_at)}. We’ll remind you 2 days before it ends.` : 'Everything is unlocked.', `/app/${patch.workspace_id}/billing`, `plan:${id}`);
    }
    if (became('free') && patch.status === 'cancelled') await notify(admin, patch.workspace_id, 'billing', 'You’re on the Free plan', 'Your plan, assets and history are saved. 3 warm leads a week keep coming.', `/app/${patch.workspace_id}/billing`, `free:${id}`);
    if (patch.status === 'past_due' && prev?.status !== 'past_due') await notify(admin, patch.workspace_id, 'billing', 'Your payment didn’t go through', 'We’ll retry over the next 7 days. Update your card to keep everything running.', `/app/${patch.workspace_id}/billing`, `pastdue:${id}`);
    if (patch.first_paid_at && !prev?.first_paid_at) await rewardReferral(admin, patch.workspace_id);

    await admin.from('billing_events').update({ processed_at: new Date().toISOString(), error: null }).eq('id', id);
    return 'ok';
  } catch (err) {
    await admin.from('billing_events').update({ error: err instanceof Error ? err.message.slice(0, 500) : 'failed' }).eq('id', id);
    throw err;
  }
}

const PLAN_NAME: Record<string, string> = { free: 'Free', launch_pass: 'Launch Pass', grow: 'Grow', scale: 'Scale' };
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '');

async function notify(admin: Admin, ws: string, kind: string, title: string, body: string, path: string, key: string) {
  const url = `${process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''}${path}`;
  await admin.rpc('enqueue_job', { p_workspace: ws, p_type: 'notify', p_payload: { kind, title, body, url }, p_run_at: new Date().toISOString(), p_key: `notify:${key}` });
}

/** After a referred workspace's first payment: both sides get a month (the referred one already had it as a 30-day trial). */
async function rewardReferral(admin: Admin, referred: string) {
  const { data: r } = await admin.from('referrals').select('id, referrer_workspace_id, status').eq('referred_workspace_id', referred).maybeSingle();
  if (!r || r.status !== 'pending') return;
  const { data: ws } = await admin.from('workspaces').select('id, owner_id').in('id', [r.referrer_workspace_id, referred]);
  const owner = (id: string) => ws?.find((w) => w.id === id)?.owner_id ?? '';
  const emails = await Promise.all([owner(r.referrer_workspace_id), owner(referred)].map(async (u) => (await admin.from('profiles').select('email').eq('id', u).maybeSingle()).data?.email ?? ''));
  const blocked = referralCheck({ referrerOwner: owner(r.referrer_workspace_id), referredOwner: owner(referred), referrerEmail: emails[0]!, referredEmail: emails[1]! });
  if (blocked) { await admin.from('referrals').update({ status: 'blocked', blocked_reason: blocked }).eq('id', r.id); return; }
  // The referrer's next charge moves a month later.
  const { data: sub } = await admin.from('subscriptions').select('provider, provider_id, status, current_period_end').eq('workspace_id', r.referrer_workspace_id).maybeSingle();
  if (sub && ['active', 'trialing'].includes(sub.status)) {
    const next = new Date(Math.max(Date.now(), Date.parse(sub.current_period_end ?? '') || Date.now()) + 30 * DAY).toISOString();
    if (sub.provider === 'dodo' && sub.provider_id) await dodo(`/subscriptions/${sub.provider_id}`, 'PATCH', { next_billing_date: next });
    await admin.from('subscriptions').update({ current_period_end: next }).eq('workspace_id', r.referrer_workspace_id);
    await admin.from('referrals').update({ status: 'rewarded', reward_applied_at: new Date().toISOString() }).eq('id', r.id);
    await notify(admin, r.referrer_workspace_id, 'billing', 'You earned a free month', 'Someone you referred just became a paying customer. Your next charge moved a month later.', `/app/${r.referrer_workspace_id}/billing`, `ref:${r.id}`);
  } else {
    await admin.from('referrals').update({ status: 'qualified' }).eq('id', r.id);
  }
}

// ---------------------------------------------------------------- subscription changes
/**
 * Cancel: no further charges. A paid month already bought stays until it ends (Refund Policy), then Free;
 * trials, unpaid and paused plans (and deletions) end at once. Data is always kept on Free.
 */
export async function cancelNow(ws: string, o: { immediate?: boolean } = {}) {
  const admin = supabaseAdmin();
  const { data: sub } = await admin.from('subscriptions').select('*').eq('workspace_id', ws).maybeSingle();
  if (!sub || ['cancelled', 'expired'].includes(sub.status)) return;
  const paidThrough = sub.status === 'active' && sub.plan !== 'launch_pass' && sub.current_period_end && Date.parse(sub.current_period_end) > Date.now();
  if (paidThrough && !o.immediate) {
    if (sub.provider === 'dodo' && sub.provider_id) await dodo(`/subscriptions/${sub.provider_id}`, 'PATCH', { cancel_at_next_billing_date: true, cancel_reason: 'cancelled_by_customer' });
    await admin.from('subscriptions').update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('workspace_id', ws);
    return;
  }
  if (sub.provider === 'dodo' && sub.provider_id && sub.plan !== 'launch_pass') await dodo(`/subscriptions/${sub.provider_id}`, 'PATCH', { status: 'cancelled', cancel_reason: 'cancelled_by_customer' });
  // Our own state changes at once; Dodo's subscription.cancelled webhook then arrives as a duplicate no-op.
  await simulate(admin, ws, sub.plan, 'subscription.cancelled');
}

/** Undo a scheduled cancellation before the paid period ends. */
export async function keepPlan(ws: string) {
  const admin = supabaseAdmin();
  const { data: sub } = await admin.from('subscriptions').select('*').eq('workspace_id', ws).maybeSingle();
  if (!sub?.cancel_at_period_end) return;
  if (sub.provider === 'dodo' && sub.provider_id) await dodo(`/subscriptions/${sub.provider_id}`, 'PATCH', { cancel_at_next_billing_date: false });
  await admin.from('subscriptions').update({ cancel_at_period_end: false, updated_at: new Date().toISOString() }).eq('workspace_id', ws);
}

/** Pause billing for 1 or 2 months; the worker resumes it on the date. */
export async function pause(ws: string, months: 1 | 2) {
  const admin = supabaseAdmin();
  const { data: sub } = await admin.from('subscriptions').select('*').eq('workspace_id', ws).maybeSingle();
  if (!sub || !['active', 'trialing'].includes(sub.status) || sub.plan === 'launch_pass') return;
  if (sub.provider === 'dodo' && sub.provider_id) await dodo(`/subscriptions/${sub.provider_id}`, 'PATCH', { status: 'paused' });
  await simulate(admin, ws, sub.plan, 'subscription.paused');
  await admin.from('subscriptions').update({ paused_until: new Date(Date.now() + months * 30 * DAY).toISOString() }).eq('workspace_id', ws);
}

export async function resume(ws: string) {
  const admin = supabaseAdmin();
  const { data: sub } = await admin.from('subscriptions').select('*').eq('workspace_id', ws).maybeSingle();
  if (!sub || sub.status !== 'paused') return;
  if (sub.provider === 'dodo' && sub.provider_id) await dodo(`/subscriptions/${sub.provider_id}`, 'PATCH', { status: 'active' });
  await simulate(admin, ws, sub.plan, 'subscription.unpaused');
  await admin.from('subscriptions').update({ paused_until: null }).eq('workspace_id', ws);
}

/** Feeds a synthetic event through the same processor (test checkout, and our side of real changes). */
export async function simulate(admin: Admin, ws: string, plan: PaidPlan, type: string, extra: Partial<BillingEvent['data']> = {}) {
  const { data: sub } = await admin.from('subscriptions').select('provider_id, customer_id').eq('workspace_id', ws).maybeSingle();
  const e: BillingEvent = { type, data: { subscription_id: plan === 'launch_pass' ? null : sub?.provider_id ?? `sim_sub_${ws.slice(0, 8)}`, payment_id: `sim_pay_${Date.now().toString(36)}`, customer: { customer_id: sub?.customer_id ?? `sim_cus_${ws.slice(0, 8)}` }, metadata: { workspace_id: ws, plan }, created_at: new Date().toISOString(), ...extra } };
  return processEvent(admin, `sim_${type}_${ws.slice(0, 8)}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, e);
}
