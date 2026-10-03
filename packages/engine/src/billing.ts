import { createHmac, timingSafeEqual } from 'node:crypto';

// Billing (PRD sections 24 and 25): Dodo Payments webhooks map onto one subscription row per workspace and
// the workspace plan. Pure functions here; the web app and worker do the I/O.

export type PaidPlan = 'launch_pass' | 'grow' | 'scale';
export type SubStatus = 'pending' | 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired';

export const TRIAL_DAYS = 7;
export const TRIAL_REMINDER_DAY = 5;
export const DUNNING_DAYS = 7;
export const LAUNCH_PASS_DAYS = 30;
export const FREE_WINS = 3;
export const FREE_LEADS_PER_WEEK = 3;
const DAY = 86_400_000;

// ---------------------------------------------------------------- webhook signatures (Standard Webhooks)
/** Verifies `webhook-signature` over `${id}.${timestamp}.${body}` with the whsec_ secret; rejects stale timestamps. */
export function verifyWebhook(secret: string, h: { id: string | null; timestamp: string | null; signature: string | null }, body: string, now = Date.now()): boolean {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${h.id}.${h.timestamp}.${body}`).digest();
  return h.signature.split(' ').some((part) => {
    const [v, sig] = part.split(',');
    if (v !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** Signs a payload the same way (tests and the test-mode simulator). */
export function signWebhook(secret: string, id: string, timestamp: string, body: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

// ---------------------------------------------------------------- events → subscription state
export interface BillingEvent {
  type: string;
  timestamp?: string;
  data: {
    payload_type?: string;
    subscription_id?: string | null;
    payment_id?: string | null;
    status?: string | null;
    product_id?: string | null;
    customer?: { customer_id?: string; email?: string } | null;
    metadata?: Record<string, unknown> | null;
    next_billing_date?: string | null;
    trial_period_days?: number | null;
    created_at?: string | null;
  };
}

export interface SubPatch {
  workspace_id: string;
  plan: PaidPlan;
  status: SubStatus;
  provider_id?: string | null;
  customer_id?: string | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  past_due_since?: string | null;
  first_paid_at?: string | null;
  /** The plan the workspace should be on after this event. */
  workspacePlan: 'free' | PaidPlan;
}

const PLANS = new Set<PaidPlan>(['launch_pass', 'grow', 'scale']);

/** Which plan a product id is: metadata first (we set it at checkout), then the configured product ids. */
export function planOf(e: BillingEvent, products: Partial<Record<PaidPlan, string>>): PaidPlan | null {
  const m = e.data.metadata?.plan;
  if (typeof m === 'string' && PLANS.has(m as PaidPlan)) return m as PaidPlan;
  const hit = (Object.entries(products) as [PaidPlan, string][]).find(([, id]) => id && id === e.data.product_id);
  return hit?.[0] ?? null;
}

export function workspaceOf(e: BillingEvent): string | null {
  const w = e.data.metadata?.workspace_id;
  return typeof w === 'string' && /^[0-9a-f-]{36}$/i.test(w) ? w : null;
}

/**
 * Maps one webhook to the new subscription state, given what we stored before.
 * Returns null for events that don't change billing state.
 */
export function applyEvent(e: BillingEvent, prev: { status: SubStatus; trial_ends_at: string | null; first_paid_at: string | null; past_due_since: string | null } | null, products: Partial<Record<PaidPlan, string>>, now = Date.now()): SubPatch | null {
  const ws = workspaceOf(e);
  const plan = planOf(e, products);
  if (!ws || !plan) return null;
  const iso = (t: number) => new Date(t).toISOString();
  const base = { workspace_id: ws, plan, provider_id: e.data.subscription_id ?? e.data.payment_id ?? null, customer_id: e.data.customer?.customer_id ?? null };
  const next = e.data.next_billing_date ?? null;

  // Launch Pass is a one-time payment: the plan for 30 days, then back to Free.
  if (plan === 'launch_pass') {
    if (e.type !== 'payment.succeeded') return null;
    return { ...base, status: 'active', current_period_end: iso(now + LAUNCH_PASS_DAYS * DAY), first_paid_at: prev?.first_paid_at ?? iso(now), workspacePlan: 'launch_pass' };
  }

  switch (e.type) {
    case 'subscription.active': {
      // A card-required trial: Dodo activates the subscription at once and charges when the trial ends.
      const trialDays = e.data.trial_period_days ?? 0;
      const start = e.data.created_at ? Date.parse(e.data.created_at) : now;
      const trialEnd = trialDays > 0 ? start + trialDays * DAY : 0;
      const trialing = trialEnd > now && !prev?.first_paid_at;
      return { ...base, status: trialing ? 'trialing' : 'active', trial_ends_at: trialing ? iso(trialEnd) : prev?.trial_ends_at ?? null, current_period_end: next ?? undefined, past_due_since: null, workspacePlan: plan };
    }
    case 'subscription.renewed':
    case 'subscription.unpaused':
    case 'subscription.plan_changed':
      // An event without a billing date keeps the one we have (undefined = unchanged).
      return { ...base, status: 'active', current_period_end: next ?? undefined, past_due_since: null, first_paid_at: e.type === 'subscription.renewed' ? prev?.first_paid_at ?? iso(now) : prev?.first_paid_at ?? null, workspacePlan: plan };
    case 'payment.succeeded':
      if (!e.data.subscription_id) return null;
      return { ...base, status: 'active', current_period_end: next ?? undefined, past_due_since: null, first_paid_at: prev?.first_paid_at ?? iso(now), workspacePlan: plan };
    case 'subscription.past_due':
    case 'subscription.on_hold':
    case 'payment.failed':
      // Dunning: keep access during retries; the worker drops the workspace to Free after DUNNING_DAYS.
      return { ...base, status: 'past_due', past_due_since: prev?.past_due_since ?? iso(now), workspacePlan: plan };
    case 'subscription.paused':
      return { ...base, status: 'paused', workspacePlan: 'free' };
    case 'subscription.cancelled':
    case 'subscription.expired':
    case 'subscription.failed':
      return { ...base, status: e.type === 'subscription.expired' ? 'expired' : 'cancelled', workspacePlan: 'free' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- trial, dunning, retention
export function trialReminderDue(s: { status: SubStatus; trial_ends_at: string | null; reminded_at: string | null }, now = Date.now()): boolean {
  if (s.status !== 'trialing' || !s.trial_ends_at || s.reminded_at) return false;
  const left = Date.parse(s.trial_ends_at) - now;
  return left <= (TRIAL_DAYS - TRIAL_REMINDER_DAY) * DAY && left > 0;
}

export function dunningExpired(s: { status: SubStatus; past_due_since: string | null }, now = Date.now()): boolean {
  return s.status === 'past_due' && !!s.past_due_since && now - Date.parse(s.past_due_since) >= DUNNING_DAYS * DAY;
}

export type CancelReason = 'too_expensive' | 'no_results' | 'too_much_work' | 'missing_feature' | 'launched_done' | 'other';
export const CANCEL_REASONS: { id: CancelReason; label: string }[] = [
  { id: 'too_expensive', label: 'Too expensive' },
  { id: 'no_results', label: 'Not seeing results' },
  { id: 'too_much_work', label: 'Too much work' },
  { id: 'missing_feature', label: 'Missing a feature' },
  { id: 'launched_done', label: 'Launched and done' },
  { id: 'other', label: 'Something else' },
];

export type Offer = { id: 'pause_1m' | 'strategy_reset' | 'trust_mode' | 'downgrade_free'; title: string; body: string; cta: string };
/** The one offer shown for an exit reason (PRD section 25), or null. */
export function offerFor(reason: CancelReason | null, o: { trustOn: boolean }): Offer | null {
  switch (reason) {
    // PRD allows a 1-month pause or 30% off for 2 months; a pause needs no discount on a live subscription.
    case 'too_expensive': return { id: 'pause_1m', title: 'Pause for a month instead', body: 'No charge for a month. Your plan, posts and leads stay exactly where they are, and it picks up again on its own.', cta: 'Pause for a month' };
    case 'no_results': return { id: 'strategy_reset', title: 'A free strategy reset', body: 'We re-read your product, pick new channels and write a fresh first week. No charge.', cta: 'Reset my strategy' };
    case 'too_much_work': return o.trustOn ? null : { id: 'trust_mode', title: 'Let it run on its own', body: 'Trust mode posts the safe, high-scoring items for you. Replies to people still wait for you.', cta: 'Turn on trust mode' };
    case 'launched_done': return { id: 'downgrade_free', title: 'Keep the Free plan instead', body: 'Your waitlist page, plan and assets stay. 3 warm leads a week keep coming.', cta: 'Switch to Free' };
    default: return null;
  }
}

/** Win-back: one email at 30 days and one at 90 after cancelling, never more. */
export function winbackDue(cancelledAt: string, sent: string[], now = Date.now()): 'winback_30' | 'winback_90' | null {
  const days = (now - Date.parse(cancelledAt)) / DAY;
  if (days >= 90 && !sent.includes('winback_90')) return 'winback_90';
  if (days >= 30 && days < 90 && !sent.includes('winback_30')) return 'winback_30';
  return null;
}

/** Referral: rewards only after the referred workspace's first payment; self-referrals are blocked. */
export function referralCheck(r: { referrerOwner: string; referredOwner: string; referrerEmail: string; referredEmail: string }): string | null {
  if (r.referrerOwner === r.referredOwner) return 'Same account';
  const dom = (e: string) => e.split('@')[1]?.toLowerCase() ?? '';
  const local = (e: string) => e.split('@')[0]!.toLowerCase().replace(/\+.*$/, '').replace(/\./g, '');
  if (dom(r.referrerEmail) === dom(r.referredEmail) && local(r.referrerEmail) === local(r.referredEmail)) return 'Same email';
  return null;
}
