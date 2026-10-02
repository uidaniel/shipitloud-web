import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueKinds, fill, fromAddress, readUnsubscribeToken, renderEmail, unsubscribeToken } from './email.ts';

process.env.UNSUBSCRIBE_SECRET = 'test-secret';

test('placeholders fill, and unknown ones disappear instead of showing braces', () => {
  assert.equal(fill('You are #{{position}}. Share {{referral_link}}{{nope}}.', { position: 12, referral_link: 'https://x/r' }), 'You are #12. Share https://x/r.');
});

test('emails escape content, link URLs, and always carry the address and unsubscribe link', () => {
  const { html, text } = renderEmail({
    subject: 'Hi', body: 'Hello <script>x</script>\n\nSee https://balans.ng/p, then reply.', brand: { name: 'Balans', accent: '#fdbf2f', onAccent: '#0d0d12' },
    cta: { label: 'Share your link', url: 'https://x.dev/r?a=1&b=2' }, footer: { address: '12 Marina, Lagos', unsubscribeUrl: 'https://app/u/tok', reason: 'You joined the Balans waitlist.' },
  });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<a href="https:\/\/balans\.ng\/p" style="color:#fdbf2f">https:\/\/balans\.ng\/p<\/a>, then reply/);
  assert.ok(html.includes('href="https://x.dev/r?a=1&amp;b=2"'));
  assert.ok(html.includes('12 Marina, Lagos') && html.includes('https://app/u/tok'));
  assert.ok(text.includes('Unsubscribe: https://app/u/tok') && text.includes('Share your link: https://x.dev/r?a=1&b=2'));
});

test('unsubscribe tokens verify and resist tampering', () => {
  const id = '6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7';
  const t = unsubscribeToken(id);
  assert.equal(readUnsubscribeToken(t), id);
  assert.equal(readUnsubscribeToken(t.slice(0, -2) + 'xx'), null);
  assert.equal(readUnsubscribeToken(`${Buffer.from('6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f8').toString('base64url')}.${t.split('.')[1]}`), null);
  assert.equal(readUnsubscribeToken('garbage'), null);
});

const all = new Set(['welcome', 'referral_nudge', 'countdown', 'launch_day']);
const at = (iso: string) => new Date(iso);

test('welcome goes out once, to recent signups only', () => {
  const s = { created_at: '2026-10-01T10:00:00Z', referral_count: 0, unsubscribed_at: null };
  assert.deepEqual(dueKinds(s, { now: at('2026-10-01T10:05:00Z'), launchDate: null, sent: new Set(), active: all }), ['welcome']);
  assert.deepEqual(dueKinds(s, { now: at('2026-10-01T10:05:00Z'), launchDate: null, sent: new Set(['welcome']), active: all }), []);
  assert.deepEqual(dueKinds(s, { now: at('2026-10-20T10:00:00Z'), launchDate: null, sent: new Set(), active: all }), []);
});

test('referral nudge after two days with no referrals, never after launch', () => {
  const s = { created_at: '2026-10-01T10:00:00Z', referral_count: 0, unsubscribed_at: null };
  const sent = new Set(['welcome']);
  assert.deepEqual(dueKinds(s, { now: at('2026-10-02T10:00:00Z'), launchDate: '2026-10-20', sent, active: all }), []);
  assert.deepEqual(dueKinds(s, { now: at('2026-10-03T11:00:00Z'), launchDate: '2026-10-20', sent, active: all }), ['referral_nudge']);
  assert.deepEqual(dueKinds({ ...s, referral_count: 2 }, { now: at('2026-10-03T11:00:00Z'), launchDate: '2026-10-20', sent, active: all }), []);
  assert.deepEqual(dueKinds(s, { now: at('2026-10-21T11:00:00Z'), launchDate: '2026-10-20', sent: new Set(['welcome', 'launch_day', 'countdown']), active: all }), []);
});

test('countdown the day before launch, launch day on the day; inactive or unsubscribed get nothing', () => {
  const s = { created_at: '2026-10-01T10:00:00Z', referral_count: 1, unsubscribed_at: null };
  const sent = new Set(['welcome']);
  assert.deepEqual(dueKinds(s, { now: at('2026-10-19T08:00:00Z'), launchDate: '2026-10-20', sent, active: all }), ['countdown']);
  assert.deepEqual(dueKinds(s, { now: at('2026-10-20T08:00:00Z'), launchDate: '2026-10-20', sent: new Set(['welcome', 'countdown']), active: all }), ['launch_day']);
  assert.deepEqual(dueKinds(s, { now: at('2026-10-20T08:00:00Z'), launchDate: '2026-10-20', sent, active: new Set(['welcome']) }), []);
  assert.deepEqual(dueKinds({ ...s, unsubscribed_at: '2026-10-02T00:00:00Z' }, { now: at('2026-10-20T08:00:00Z'), launchDate: '2026-10-20', sent, active: all }), []);
  // Someone joining on the eve gets a welcome, not a "tomorrow" email straight after.
  assert.deepEqual(dueKinds({ ...s, created_at: '2026-10-19T07:00:00Z' }, { now: at('2026-10-19T08:00:00Z'), launchDate: '2026-10-20', sent: new Set(), active: all }), ['welcome']);
});

test('sender: "via ShipItLoud" until the founder’s own domain is verified', () => {
  process.env.EMAIL_FROM = 'ShipItLoud <hello@mail.shipitloud.com>';
  assert.equal(fromAddress({ fromName: 'Ada at Balans', product: 'Balans' }), 'Ada at Balans via ShipItLoud <hello@mail.shipitloud.com>');
  assert.equal(fromAddress({ fromName: '', product: 'Balans', domain: 'balans.ng', verified: true }), 'Balans <hello@balans.ng>');
});
