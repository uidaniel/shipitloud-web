import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, dunningExpired, offerFor, referralCheck, signWebhook, trialReminderDue, verifyWebhook, winbackDue, type BillingEvent } from './billing.ts';

const SECRET = `whsec_${Buffer.from('test-secret-key-32-bytes-long!!!').toString('base64')}`;
const WS = '11111111-2222-3333-4444-555555555555';
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-03T12:00:00Z');
const products = { grow: 'prod_grow', scale: 'prod_scale', launch_pass: 'prod_lp' };
const ev = (type: string, data: Partial<BillingEvent['data']> = {}): BillingEvent => ({ type, data: { subscription_id: 'sub_1', product_id: 'prod_grow', metadata: { workspace_id: WS }, customer: { customer_id: 'cus_1' }, ...data } });

test('webhook signatures: valid, tampered, stale and multi-signature headers', () => {
  const body = JSON.stringify({ type: 'subscription.active' });
  const ts = String(Math.floor(NOW / 1000));
  const sig = signWebhook(SECRET, 'msg_1', ts, body);
  assert.equal(verifyWebhook(SECRET, { id: 'msg_1', timestamp: ts, signature: sig }, body, NOW), true);
  assert.equal(verifyWebhook(SECRET, { id: 'msg_1', timestamp: ts, signature: `v1,AAAA ${sig}` }, body, NOW), true);
  assert.equal(verifyWebhook(SECRET, { id: 'msg_1', timestamp: ts, signature: sig }, body + ' ', NOW), false);
  assert.equal(verifyWebhook(SECRET, { id: 'msg_2', timestamp: ts, signature: sig }, body, NOW), false);
  assert.equal(verifyWebhook(SECRET, { id: 'msg_1', timestamp: ts, signature: sig }, body, NOW + 10 * 60_000), false);
  assert.equal(verifyWebhook('', { id: 'msg_1', timestamp: ts, signature: sig }, body, NOW), false);
});

test('a card-required trial starts as trialing for 7 days on Grow', () => {
  const p = applyEvent(ev('subscription.active', { trial_period_days: 7, created_at: new Date(NOW).toISOString(), next_billing_date: new Date(NOW + 7 * DAY).toISOString() }), null, products, NOW)!;
  assert.equal(p.status, 'trialing');
  assert.equal(p.workspacePlan, 'grow');
  assert.equal(p.trial_ends_at, new Date(NOW + 7 * DAY).toISOString());
});

test('first payment ends the trial; renewals keep first_paid_at', () => {
  const prev = { status: 'trialing' as const, trial_ends_at: new Date(NOW).toISOString(), first_paid_at: null, past_due_since: null };
  const p = applyEvent(ev('payment.succeeded'), prev, products, NOW)!;
  assert.equal(p.status, 'active');
  assert.equal(p.first_paid_at, new Date(NOW).toISOString());
  const r = applyEvent(ev('subscription.renewed'), { ...prev, first_paid_at: '2026-01-01T00:00:00.000Z' }, products, NOW)!;
  assert.equal(r.first_paid_at, '2026-01-01T00:00:00.000Z');
});

test('failed payments open dunning once; cancel and pause drop to Free', () => {
  const pd = applyEvent(ev('payment.failed'), null, products, NOW)!;
  assert.equal(pd.status, 'past_due');
  assert.equal(pd.workspacePlan, 'grow', 'access stays during retries');
  const again = applyEvent(ev('subscription.on_hold'), { status: 'past_due', trial_ends_at: null, first_paid_at: null, past_due_since: '2026-10-01T00:00:00.000Z' }, products, NOW)!;
  assert.equal(again.past_due_since, '2026-10-01T00:00:00.000Z');
  assert.equal(applyEvent(ev('subscription.cancelled'), null, products, NOW)!.workspacePlan, 'free');
  assert.equal(applyEvent(ev('subscription.paused'), null, products, NOW)!.status, 'paused');
});

test('events without our workspace or a known product are ignored', () => {
  assert.equal(applyEvent(ev('subscription.active', { metadata: {} }), null, products, NOW), null);
  assert.equal(applyEvent(ev('subscription.active', { product_id: 'prod_other', metadata: { workspace_id: WS } }), null, products, NOW), null);
  assert.equal(applyEvent(ev('dispute.opened'), null, products, NOW), null);
});

test('Launch Pass is a one-time payment for 30 days', () => {
  const p = applyEvent(ev('payment.succeeded', { subscription_id: null, payment_id: 'pay_1', product_id: 'prod_lp' }), null, products, NOW)!;
  assert.equal(p.plan, 'launch_pass');
  assert.equal(p.current_period_end, new Date(NOW + 30 * DAY).toISOString());
  assert.equal(p.provider_id, 'pay_1');
});

test('trial reminder on day 5, dunning after 7 days, win-back twice at most', () => {
  const end = new Date(NOW + 2 * DAY).toISOString();
  assert.equal(trialReminderDue({ status: 'trialing', trial_ends_at: end, reminded_at: null }, NOW), true);
  assert.equal(trialReminderDue({ status: 'trialing', trial_ends_at: new Date(NOW + 4 * DAY).toISOString(), reminded_at: null }, NOW), false);
  assert.equal(trialReminderDue({ status: 'trialing', trial_ends_at: end, reminded_at: 'x' }, NOW), false);
  assert.equal(dunningExpired({ status: 'past_due', past_due_since: new Date(NOW - 7 * DAY).toISOString() }, NOW), true);
  assert.equal(dunningExpired({ status: 'past_due', past_due_since: new Date(NOW - 6 * DAY).toISOString() }, NOW), false);
  const c = new Date(NOW - 31 * DAY).toISOString();
  assert.equal(winbackDue(c, [], NOW), 'winback_30');
  assert.equal(winbackDue(c, ['winback_30'], NOW), null);
  assert.equal(winbackDue(new Date(NOW - 95 * DAY).toISOString(), ['winback_30'], NOW), 'winback_90');
  assert.equal(winbackDue(new Date(NOW - 95 * DAY).toISOString(), ['winback_30', 'winback_90'], NOW), null);
});

test('one matching offer per exit reason', () => {
  assert.equal(offerFor('too_expensive', { trustOn: false })!.id, 'pause_1m');
  assert.equal(offerFor('no_results', { trustOn: false })!.id, 'strategy_reset');
  assert.equal(offerFor('too_much_work', { trustOn: false })!.id, 'trust_mode');
  assert.equal(offerFor('too_much_work', { trustOn: true }), null);
  assert.equal(offerFor('launched_done', { trustOn: false })!.id, 'downgrade_free');
  assert.equal(offerFor('other', { trustOn: false }), null);
});

test('self-referrals are blocked, including plus and dot aliases', () => {
  assert.equal(referralCheck({ referrerOwner: 'u1', referredOwner: 'u1', referrerEmail: 'a@x.com', referredEmail: 'b@y.com' }), 'Same account');
  assert.equal(referralCheck({ referrerOwner: 'u1', referredOwner: 'u2', referrerEmail: 'ada.l@gmail.com', referredEmail: 'adal+2@gmail.com' }), 'Same email');
  assert.equal(referralCheck({ referrerOwner: 'u1', referredOwner: 'u2', referrerEmail: 'ada@gmail.com', referredEmail: 'bob@gmail.com' }), null);
});

test('events without a billing date keep the stored period end', () => {
  const p = applyEvent(ev('subscription.unpaused'), { status: 'paused', trial_ends_at: null, first_paid_at: 'x', past_due_since: null }, products, NOW)!;
  assert.equal(p.current_period_end, undefined);
  assert.equal(applyEvent(ev('subscription.renewed', { next_billing_date: '2026-11-03T00:00:00.000Z' }), null, products, NOW)!.current_period_end, '2026-11-03T00:00:00.000Z');
});
