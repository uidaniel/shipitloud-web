import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestStats, digestText, fallbackSummary, nextActions, quiet, statsBlock, unknownNumbers, type DigestDay, type DigestSignals } from './digest.ts';

const day = (i: number, v: Partial<DigestDay> = {}): DigestDay => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, conversations: 0, replies: 0, posts: 0, clicks: 0, signups: 0, ...v });
const fourteen = [...Array.from({ length: 7 }, (_, i) => day(i, { clicks: 2, signups: 1 })), ...Array.from({ length: 7 }, (_, i) => day(i + 7, { clicks: 4, signups: 2, posts: i === 0 ? 3 : 0 }))];
const setUp: DigestSignals = { pending: 0, unanswered: 0, listening: true, snippet: true, weekly_plan: true, published_total: 10, blog_posts: 2, waitlist: true, sequence_on: true };

test('digest totals the last 7 days and compares with the 7 before', () => {
  const s = digestStats(fourteen, [{ channel: 'x', clicks: 40, signups: 9, posts: 5 }, { channel: 'reddit', clicks: 90, signups: 3, posts: 2 }]);
  assert.deepEqual(s.totals, { conversations: 0, replies: 0, posts: 3, clicks: 28, signups: 14 });
  assert.deepEqual(s.previous, { conversations: 0, replies: 0, posts: 0, clicks: 14, signups: 7 });
  assert.equal(s.best_channel?.channel, 'x', 'signups beat clicks');
  assert.equal(digestStats(fourteen, [], {}, true).previous, null, 'no comparison in the first week');
  assert.equal(digestStats(fourteen.slice(-5), []).previous, null, 'not enough history');
});

test('next actions put people waiting first and stop at three', () => {
  const s = digestStats(fourteen, []);
  const a = nextActions(s, { ...setUp, unanswered: 4, pending: 2, snippet: false, listening: true }, 'https://x.test/app/w');
  assert.equal(a.length, 3);
  assert.match(a[0]!.title, /Reply to 4 people/);
  assert.match(a[1]!.title, /inbox \(2 waiting\)/);
  assert.equal(a[2]!.href, 'https://x.test/app/w/analytics#snippet');
  assert.equal(nextActions(s, setUp, '').length, 0, 'nothing to nag about when everything is set up');
  const fresh = nextActions(digestStats([], []), { ...setUp, listening: false, published_total: 0, weekly_plan: false }, '');
  assert.deepEqual(fresh.map((x) => x.href), ['/listening', '/plan', '/content']);
});

test('numbers the AI writes must come from the stats', () => {
  const s = digestStats(fourteen, [{ channel: 'x', clicks: 40, signups: 9, posts: 5 }]);
  assert.deepEqual(unknownNumbers('You got 14 signups, up 100% on the 7 before, and x brought 9.', s), []);
  assert.deepEqual(unknownNumbers('You got 14 signups and 250 visitors.', s), ['250']);
  assert.deepEqual(unknownNumbers('Signups grew 45%.', s), ['45%']);
});

test('fallback summary and text are honest about quiet weeks', () => {
  const q = digestStats(Array.from({ length: 7 }, (_, i) => day(i)), []);
  assert.ok(quiet(q));
  assert.match(fallbackSummary(q, 'first_week').summary, /^Your first 7 days were quiet: nothing/);
  const s = digestStats(fourteen, [{ channel: 'x', clicks: 40, signups: 9, posts: 5 }]);
  const f = fallbackSummary(s, 'weekly');
  assert.equal(f.summary, 'This week: 3 posts published, 28 clicks on your links, 14 signups.');
  assert.ok(f.worked.some((w) => w.includes('More signups than the week before (14 vs 7)')));
  assert.match(statsBlock(s, 'weekly'), /14 signups \(the week before: 7\)/);
  const t = digestText({ ...f, actions: [{ title: 'Do a', why: 'because', href: '/a' }] });
  assert.match(t, /What worked:\n- /);
  assert.match(t, /Your next step:\n1\. Do a: because$/);
});
