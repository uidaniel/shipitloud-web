import { test } from 'node:test';
import assert from 'node:assert/strict';
import { competitorStatements, hasKeyword, seoScore, slugify } from './seo-score.ts';

const para = 'Freelancers in Lagos send invoices on WhatsApp and get paid to their bank account without chasing. Clients open a link and pay. Nobody installs anything.';
const section = (h: string) => `## ${h}\n\n${Array.from({ length: 9 }, () => para).join('\n\n')}`;
const good = {
  keyword: 'invoice app for freelancers',
  title: 'The best invoice app for freelancers in Nigeria',
  slug: 'best-invoice-app-for-freelancers',
  metaTitle: 'Best invoice app for freelancers (2026)',
  metaDescription: 'Looking for an invoice app for freelancers? Compare simple options, what to look for, and how to get paid on time without chasing clients.',
  body: `An invoice app for freelancers should make sending an invoice and getting paid quick.\n\n${section('What to look for in an invoice app for freelancers')}\n\n${section('Getting paid on time')}\n\n${section('Sending your first invoice')}\n\n${section('Our pick')}`,
  faq: [{ q: 'a', a: 'b' }, { q: 'c', a: 'd' }, { q: 'e', a: 'f' }],
};

test('a well-shaped article scores high with no tips', () => {
  const r = seoScore(good);
  assert.ok(r.score >= 95, `${r.score}: ${r.tips.join(' | ')}`);
  assert.ok(r.words > 800);
});

test('missing keyword, thin content and few sections are caught', () => {
  const r = seoScore({ ...good, title: 'Getting paid', body: 'Short.', faq: [] });
  assert.ok(r.score < 60);
  assert.ok(r.tips.some((t) => t.includes('in the title')));
  assert.ok(r.tips.some((t) => t.includes('short')));
});

test('[verify] placeholders are counted and cost points', () => {
  const r = seoScore({ ...good, body: `${good.body}\n\nWave charges [verify: Wave's fee for card payments] per invoice.` });
  assert.deepEqual(r.verify, ["Wave's fee for card payments"]);
  assert.ok(r.tips.some((t) => t.includes('[verify]')));
});

test('keyword matching ignores plurals and filler words', () => {
  assert.ok(hasKeyword('Invoicing apps: the best invoice apps for a freelancer', 'invoice app for freelancers'));
  assert.ok(!hasKeyword('Payroll software for small teams', 'invoice app'));
});

test('slugs are clean and cut on a word', () => {
  assert.equal(slugify('Wave vs Balans: Which Invoice App Is Better?'), 'wave-vs-balans-which-invoice-app-is-better');
  assert.ok(slugify('a very long title '.repeat(10)).length <= 60);
  assert.ok(!slugify('a very long title '.repeat(10)).endsWith('-'));
});

test('statements about competitors are pulled out for checking; hedged or unrelated ones are not', () => {
  const md = '## Why switch\n\nWave sends payments as USD transfers. Wave is free and honest. Many people like simple tools.\n\n- Zoho Invoice has an offline mode.\n\nWave charges [verify: Wave card fee] per payment. The wave of new tools keeps growing.';
  const s = competitorStatements(md, ['Wave', 'Zoho Invoice']);
  assert.deepEqual(s.map((x) => x.competitor), ['Wave', 'Wave', 'Zoho Invoice']);
  assert.ok(s[0]!.sentence.startsWith('Wave sends payments'));
  assert.deepEqual(competitorStatements('Nothing about rivals here.', ['Wave']), []);
});
