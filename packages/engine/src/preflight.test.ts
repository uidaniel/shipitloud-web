import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mentionsBrand, preflight, type PreflightInput } from './preflight.ts';

const brand = { name: 'Balans', url: 'https://balans.ng' };
const account = { name: 'founder', karma: 900, created_utc: Date.now() / 1000 - 400 * 86_400 };
const clean = (n: number) => Array.from({ length: n }, (_, i) => ({ subreddit: 'freelance', text: `helpful answer ${i}`, removed: false }));
const base: PreflightInput = { subreddit: 'freelance', rules: [{ short_name: 'Be kind' }], account, recent: clean(20), reply: 'Send the invoice the same day you finish the work.', brand };

test('a helpful reply from a healthy account is ok', () => {
  const r = preflight(base);
  assert.equal(r.verdict, 'ok');
  assert.equal(r.selfPromoRatio, 0);
});

test('brand detection by name or domain, whole words only', () => {
  assert.ok(mentionsBrand('I built Balans for this', brand));
  assert.ok(mentionsBrand('see balans.ng', brand));
  assert.ok(!mentionsBrand('my balance sheet', brand));
});

test('self-promotion ratio warns above 10% and blocks above 25%', () => {
  const some = [...clean(16), ...Array.from({ length: 4 }, () => ({ subreddit: 'x', text: 'try Balans', removed: false }))];
  assert.equal(preflight({ ...base, recent: some }).verdict, 'warn');
  const lots = [...clean(10), ...Array.from({ length: 10 }, () => ({ subreddit: 'x', text: 'try Balans', removed: false }))];
  assert.equal(preflight({ ...base, recent: lots }).verdict, 'block');
});

test('removals in this subreddit warn, then block at three', () => {
  const one = [{ subreddit: 'freelance', text: 'x', removed: true }, ...clean(19)];
  assert.equal(preflight({ ...base, recent: one }).verdict, 'warn');
  const three = [...Array.from({ length: 3 }, () => ({ subreddit: 'Freelance', text: 'x', removed: true })), ...clean(17)];
  const r = preflight({ ...base, recent: three });
  assert.equal(r.verdict, 'block');
  assert.equal(r.pastRemovals, 3);
});

test('no-self-promotion rule: naming the product warns, linking to it blocks', () => {
  const rules = [{ short_name: 'No self-promotion', description: 'Do not advertise your product.' }];
  assert.equal(preflight({ ...base, rules, reply: 'I built Balans, which does this.' }).verdict, 'warn');
  assert.equal(preflight({ ...base, rules, reply: 'I built Balans: https://balans.ng' }).verdict, 'block');
});

test('no-links rule blocks any link', () => {
  const rules = [{ short_name: 'No links', description: 'Links are not allowed in comments.' }];
  assert.equal(preflight({ ...base, rules, reply: 'Read https://example.com/guide' }).verdict, 'block');
});

test('new, low-karma or logged-out accounts get a warning, not a block', () => {
  assert.equal(preflight({ ...base, account: { name: 'n', karma: 3, created_utc: Date.now() / 1000 - 2 * 86_400 } }).verdict, 'warn');
  assert.equal(preflight({ ...base, account: null, recent: [] }).verdict, 'warn');
});

test('an empty reply is blocked', () => {
  assert.equal(preflight({ ...base, reply: '   ' }).verdict, 'block');
});
