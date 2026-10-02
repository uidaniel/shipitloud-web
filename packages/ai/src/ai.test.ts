// No test here calls the real API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BudgetExceededError, costOf, generate, type Ledger, type LedgerRow } from './client.ts';
import { BrandBrainSchema, mockBrandBrain } from './prompts/brand-brain.ts';
import { mockVideoScript, videoScriptPrompt } from './prompts/video.ts';

const ledger = (spent: number): Ledger & { rows: LedgerRow[] } => {
  const rows: LedgerRow[] = [];
  return { rows, async spentThisMonth() { return spent; }, async record(r) { rows.push(r); } };
};
const args = (l: Ledger) => ({
  ledger: l, purpose: 'test', promptVersion: 't@1', workspaceId: null, model: 'claude-haiku-4-5',
  system: 'sys', user: 'hello', schema: BrandBrainSchema, maxTokens: 1500, mock: () => mockBrandBrain('Balans'),
});

test('cost math: Haiku 4.5 at $1/$5 per million, cache reads at 10%', () => {
  assert.equal(costOf('claude-haiku-4-5', { input: 1_000_000, output: 0 }), 1);
  assert.equal(costOf('claude-haiku-4-5', { input: 0, output: 1_000_000 }), 5);
  assert.equal(costOf('claude-haiku-4-5', { input: 0, output: 0, cacheRead: 1_000_000 }), 0.1);
  assert.equal(costOf('unknown-model', { input: 1_000_000, output: 0 }), 4, 'unknown models priced at the dearest');
});

test('mock mode never calls the API or records spend', async () => {
  const prev = process.env.AI_MODE;
  process.env.AI_MODE = 'mock';
  const l = ledger(0);
  const r = await generate(args(l));
  assert.equal(r.mocked, true);
  assert.equal(r.costUsd, 0);
  assert.equal(l.rows.length, 0);
  assert.equal(r.data.voice.tone.length > 0, true);
  process.env.AI_MODE = prev;
});

test('budget cap blocks the call before any request is made', async () => {
  const prev = { mode: process.env.AI_MODE, key: process.env.ANTHROPIC_API_KEY, budget: process.env.AI_MONTHLY_BUDGET_USD };
  delete process.env.AI_MODE;
  process.env.ANTHROPIC_API_KEY = 'sk-test-not-used';
  process.env.AI_MONTHLY_BUDGET_USD = '1';
  const l = ledger(0.999);
  await assert.rejects(generate(args(l)), BudgetExceededError);
  assert.equal(l.rows.length, 0, 'nothing recorded because nothing was sent');
  Object.assign(process.env, { AI_MODE: prev.mode ?? '', ANTHROPIC_API_KEY: prev.key ?? '', AI_MONTHLY_BUDGET_USD: prev.budget ?? '' });
  if (!prev.mode) delete process.env.AI_MODE;
  if (!prev.key) delete process.env.ANTHROPIC_API_KEY;
  if (!prev.budget) delete process.env.AI_MONTHLY_BUDGET_USD;
});

import { findUnsupportedClaims } from './claims.ts';
test('claim checker flags invented numbers and outcome words, allows backed facts', () => {
  const facts = 'Invoice from WhatsApp, get paid straight to your bank. Naira, dollars or pounds.';
  const flags = findUnsupportedClaims('Get paid instantly! ₦50k lands next day. 2x faster. 500 freelancers love it.', facts);
  assert.ok(flags.some((f) => f.includes('instantly')));
  assert.ok(flags.some((f) => f.includes('₦50k')));
  assert.ok(flags.some((f) => f.includes('next day')));
  assert.ok(flags.some((f) => f.includes('2x')));
  assert.ok(flags.some((f) => f.includes('500 freelancers')));
  assert.deepEqual(findUnsupportedClaims('Invoice from WhatsApp, get paid straight to your bank.', facts), []);
});

test('video script mock fits the shots and the stage', () => {
  const b = { name: 'Balans', url: null, one_liner: null, target_customer: null, pain_points: ['Chasing clients for payment'], competitors: [], keywords: [], tone: null, dos: [], donts: [], launch_date: null };
  const pre = mockVideoScript(b, 3, false);
  assert.equal(pre.captions.length, 3);
  assert.equal(pre.cta, 'Join the waitlist');
  assert.equal(mockVideoScript(b, 2, true).cta, 'Try it today');
  assert.match(videoScriptPrompt(b, [{ headings: ['A'] }, { headings: [] }], false), /exactly 2 captions/);
});

test('claim checker flags absolute claims and user stories', () => {
  const flags = findUnsupportedClaims('Works every time. One of our beta users asked for it. Works for every freelancer we know.', 'Invoice from WhatsApp');
  assert.ok(flags.some((f) => f.toLowerCase().includes('works every time')), flags.join('|'));
  assert.ok(flags.some((f) => f.includes('every freelancer we know')));
  assert.ok(flags.some((f) => f.includes('story about a user')));
  assert.deepEqual(findUnsupportedClaims('Send one reminder on day 3. Most invoices get paid.', 'x'), []);
});

test('claim checker flags invented results and roadmap promises', () => {
  const flags = findUnsupportedClaims('One message moves most payments from 30 days to 7. Next: payment reminders.', 'Invoice from WhatsApp');
  assert.ok(flags.some((f) => f.includes('from 30 days to 7')), flags.join('|'));
  assert.ok(flags.some((f) => f.includes('future plan')));
  assert.deepEqual(findUnsupportedClaims('Send one message on day 3, then move on to the next client.', 'x'), []);
});

test('claim checker flags security promises, retention outcomes and pricing it was not given', () => {
  const flags = findUnsupportedClaims('Your invoice links are encrypted. Most freelancers in Nigeria who try it stay. Balans is free to try.', 'Invoice from WhatsApp');
  assert.ok(flags.some((f) => f.startsWith('Security claim')), flags.join('|'));
  assert.ok(flags.some((f) => f.startsWith('Unverified outcome')));
  assert.ok(flags.some((f) => f.startsWith('Pricing claim')));
  assert.deepEqual(findUnsupportedClaims('Balans is free to try.', 'Balans is free to try for 14 days'), []);
});

test('claim checker flags time statistics', () => {
  const flags = findUnsupportedClaims('Most freelancers spend 10 hours a month chasing unpaid invoices.', 'Invoice from WhatsApp');
  assert.ok(flags.some((f) => f.includes('10 hours a month')), flags.join('|'));
  assert.deepEqual(findUnsupportedClaims('Send one reminder every week.', 'x'), []);
});
