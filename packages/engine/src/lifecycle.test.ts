import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIFECYCLE, churnRisk, dueLifecycle, hashKey, newApiKey, parseTrack, type LifecycleUser } from './lifecycle.ts';

const now = new Date('2026-10-02T12:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const ahead = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
const user = (u: Partial<LifecycleUser> = {}): LifecycleUser => ({ email: 'a@b.co', status: 'free', signed_up_at: ago(1), activated_at: null, trial_ends_at: null, unsubscribed_at: null, ...u });
const all = new Set<string>(LIFECYCLE);
const due = (u: LifecycleUser, sent: string[] = [], active = all) => dueLifecycle(u, { now, sent: new Set(sent), active });

test('lifecycle emails go at the right moment, once each', () => {
  assert.equal(due(user()), 'welcome');
  assert.equal(due(user(), ['welcome']), null);
  assert.equal(due(user({ signed_up_at: ago(80), activated_at: ago(70) })), null, 'too late for a welcome, already activated');
  assert.equal(due(user({ signed_up_at: ago(50) }), ['welcome']), 'activation_nudge');
  assert.equal(due(user({ signed_up_at: ago(50) })), 'welcome', 'welcome first, nudge on a later run');
  assert.equal(due(user({ signed_up_at: ago(80) })), 'activation_nudge', 'signed up before emails were on: too late to welcome, still nudge');
  assert.equal(due(user({ signed_up_at: ago(50), activated_at: ago(40) }), ['welcome']), null, 'activated: no nudge');
  assert.equal(due(user({ signed_up_at: ago(24 * 15) }), ['welcome']), null, 'two weeks on, stop nudging');
  assert.equal(due(user({ status: 'trial', trial_ends_at: ahead(48), signed_up_at: ago(50) }), ['welcome']), 'trial_ending', 'trial ending beats the nudge');
  assert.equal(due(user({ status: 'trial', trial_ends_at: ago(1) }), ['welcome']), null, 'trial already over');
  assert.equal(due(user({ status: 'free', activated_at: ago(100), signed_up_at: ago(24 * 8) }), ['welcome']), 'upgrade_offer');
  assert.equal(due(user({ status: 'paid', activated_at: ago(100), signed_up_at: ago(24 * 8) }), ['welcome']), null, 'paying users get no upgrade offer');
  assert.equal(due(user({ email: null })), null);
  assert.equal(due(user({ unsubscribed_at: ago(1) })), null);
  assert.equal(due(user({ signed_up_at: ago(50) }), [], new Set(['activation_nudge'])), 'activation_nudge', 'no welcome email set up: nudge anyway');
});

test('churn risk: falling activity or silence, not a quiet newcomer', () => {
  assert.equal(churnRisk({ recent: 2, previous: 10, last_event: ago(24) }, now).risk, true);
  assert.match(churnRisk({ recent: 2, previous: 10, last_event: ago(24) }, now).reason, /from 10 to 2/);
  assert.equal(churnRisk({ recent: 6, previous: 10, last_event: ago(24) }, now).risk, false);
  assert.equal(churnRisk({ recent: 0, previous: 2, last_event: ago(24 * 3) }, now).risk, false, 'too little history to call it');
  assert.match(churnRisk({ recent: 0, previous: 1, last_event: ago(24 * 12) }, now).reason, /Not seen for 12 days/);
  assert.equal(churnRisk({ recent: 0, previous: 0, last_event: null }, now).risk, false, 'never tracked: nothing to compare');
});

test('server API input is checked and cleaned', () => {
  const ok = parseTrack({ user: { id: 'u_1', email: 'Ada@Example.com', status: 'trial', trial_ends_at: '2026-10-09' }, event: 'activated' });
  assert.ok(!('error' in ok));
  if (!('error' in ok)) {
    assert.equal(ok.user.email, 'ada@example.com');
    assert.equal(ok.user.trial_ends_at, '2026-10-09T00:00:00.000Z');
    assert.equal(ok.event, 'activated');
  }
  const partial = parseTrack({ user_id: 'u_2', event: 'opened editor' });
  assert.ok(!('error' in partial) && !('email' in partial.user), 'fields not sent are left alone');
  assert.match((parseTrack({ user: { email: 'a@b.co' } }) as { error: string }).error, /user.id/);
  assert.match((parseTrack({ user: { id: 'x', email: 'nope' } }) as { error: string }).error, /valid email/);
  assert.match((parseTrack({ user: { id: 'x', status: 'vip' } }) as { error: string }).error, /trial, free, paid, churned/);
  assert.match((parseTrack({ user: { id: 'x' }, event: '<script>' }) as { error: string }).error, /letters, numbers/);
});

test('API keys are random and only their hash is kept', () => {
  const a = newApiKey(); const b = newApiKey();
  assert.match(a.key, /^sil_sk_[\w-]{32}$/);
  assert.notEqual(a.key, b.key);
  assert.equal(a.hash, hashKey(a.key));
  assert.equal(a.prefix, a.key.slice(0, 11));
});
