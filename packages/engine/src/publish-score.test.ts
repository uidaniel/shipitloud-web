import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishScore } from './publish-score.ts';

test('a clean, specific X post scores high with no tips', () => {
  const r = publishScore({ platform: 'x', text: 'Week 6 of building Balans: 40 to 112 waitlist signups. What worked was one honest Reddit reply. What do you post when you have nothing new to ship?' });
  assert.ok(r.score >= 90, `score ${r.score}: ${r.tips.join(' | ')}`);
});

test('over-length X posts and thread parts lose points', () => {
  assert.ok(publishScore({ platform: 'x', text: 'a '.repeat(200) }).score <= 75);
  assert.ok(publishScore({ platform: 'x', text: '', thread: ['short first post here, fine and specific', 'b'.repeat(300)] }).tips.some((t) => t.includes('280')));
});

test('generic openers, buzzwords and em dashes are flagged', () => {
  const r = publishScore({ platform: 'linkedin', text: `Excited to announce our game-changer — it will revolutionize invoicing — and unlock the future.\n\n${'Freelancers in Lagos send invoices from WhatsApp now. '.repeat(10)}` });
  assert.ok(r.tips.some((t) => t.includes('generic opener')));
  assert.ok(r.tips.some((t) => t.includes('marketing copy')));
  assert.ok(r.tips.some((t) => t.includes('em dashes')));
  assert.ok(r.score < 70);
});

test('hashtag spam and unsupported claims lose points', () => {
  assert.ok(publishScore({ platform: 'x', text: 'Invoice from WhatsApp and get paid to your bank today #a #b #c #d' }).tips.some((t) => t.includes('hashtags')));
  const r = publishScore({ platform: 'x', text: 'Get paid 2x faster with Balans. Trusted by 500 freelancers already.', flags: ['Unverified number: "2x"', 'Unverified number: "500 freelancers"'] });
  assert.ok(r.score <= 70);
});

test('LinkedIn walls of text are caught; short posts too', () => {
  assert.ok(publishScore({ platform: 'linkedin', text: 'word '.repeat(150) }).tips.some((t) => t.includes('wall of text')));
  assert.ok(publishScore({ platform: 'linkedin', text: 'Too short.' }).tips.some((t) => t.includes('very short')));
});

test('the hook is the first sentence, so single-line posts are judged fairly', () => {
  const r = publishScore({ platform: 'x', text: 'Shipped this week: deposits. Set one when you create the invoice and your client pays it first, then the rest when the work is done.' });
  assert.ok(!r.tips.some((t) => t.includes('first line')), r.tips.join('|'));
});
