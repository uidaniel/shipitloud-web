import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDisposable, isReferralCode, makeReferralCode, normalizeEmail, normalizeProductUrl, rateLimited, resolveSource } from './guard.ts';
import { MemoryWaitlistStore } from './memory-store.ts';
import type { JoinInput } from './types.ts';

const base = (email: string, extra: Partial<JoinInput> = {}): JoinInput => ({
  pageSlug: 'p',
  email,
  emailNormalized: normalizeEmail(email),
  consent: true,
  consentText: 'x',
  code: makeReferralCode(),
  refCode: null,
  productUrl: null,
  source: 'direct',
  campaign: null,
  ipHash: `ip-${email}`,
  boost: 5,
  ...extra,
});

test('normalizeEmail collapses gmail dots and plus tags', () => {
  assert.equal(normalizeEmail('Jo.Hn+launch@GoogleMail.com'), 'john@gmail.com');
  assert.equal(normalizeEmail('a.b+x@acme.io'), 'a.b@acme.io');
});

test('disposable domains and referral codes', () => {
  assert.ok(isDisposable('x@mailinator.com'));
  assert.ok(!isDisposable('x@acme.io'));
  assert.ok(isReferralCode(makeReferralCode()));
  assert.ok(!isReferralCode('../etc'));
});

test('product URL normalization', () => {
  assert.equal(normalizeProductUrl('balans.app'), 'https://balans.app/');
  assert.equal(normalizeProductUrl('javascript:alert(1)'), null);
  assert.equal(normalizeProductUrl('localhost'), null);
});

test('source resolution order', () => {
  assert.equal(resolveSource({ ref: 'abc', utmSource: 'x' }), 'referral');
  assert.equal(resolveSource({ utmSource: 'Reddit' }), 'reddit');
  assert.equal(resolveSource({ referrerHost: 'www.news.ycombinator.com' }), 'news.ycombinator.com');
  assert.equal(resolveSource({}), 'direct');
});

test('rate limit', () => {
  for (let i = 0; i < 3; i++) assert.equal(rateLimited('k', 3, 1000, 0), false);
  assert.equal(rateLimited('k', 3, 1000, 10), true);
  assert.equal(rateLimited('k', 3, 1000, 5000), false);
});

test('join assigns positions, dedupes, and referrals skip the queue', async () => {
  const s = new MemoryWaitlistStore();
  const a = await s.join(base('a@x.io'));
  assert.deepEqual([a.position, a.total, a.existing], [1, 1, false]);
  for (const e of ['b', 'c', 'd', 'e', 'f', 'g']) await s.join(base(`${e}@x.io`));
  const g = await s.status((await s.join(base('g@x.io'))).code, 5);
  assert.equal(g?.position, 7);

  const again = await s.join(base('A@x.io'));
  assert.equal(again.existing, true);
  assert.equal(again.code, a.code);

  // g refers someone: score 7 - 5 = 2 ties with b, and ties go to the earlier signup, so g is #3.
  await s.join(base('h@x.io', { refCode: g!.code }));
  const g2 = await s.status(g!.code, 5);
  assert.equal(g2?.referrals, 1);
  assert.equal(g2?.position, 3);
});

test('referral from the same network is not counted', async () => {
  const s = new MemoryWaitlistStore();
  const a = await s.join(base('a@x.io', { ipHash: 'same' }));
  await s.join(base('b@x.io', { ipHash: 'same', refCode: a.code }));
  assert.equal((await s.status(a.code, 5))?.referrals, 0);
});

test('stats count by source', async () => {
  const s = new MemoryWaitlistStore();
  await s.join(base('a@x.io', { source: 'reddit' }));
  await s.join(base('b@x.io', { source: 'reddit' }));
  await s.join(base('c@x.io', { source: 'x' }));
  const st = await s.stats('p');
  assert.equal(st.total, 3);
  assert.deepEqual(st.bySource[0], { source: 'reddit', count: 2 });
});
