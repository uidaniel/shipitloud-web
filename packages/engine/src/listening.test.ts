// Filtering rules, built from real noise seen when probing HN and Bluesky (no network, no DB, no AI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainWords, heuristicScore, queriesFor, topicMatch } from './listening.ts';

const cfg = { keywords: ['invoice app', 'chasing clients for payment'], competitors: ['Wave', 'FreshBooks'] };
const brand = { one_liner: 'Invoice from WhatsApp, get paid to your bank', pain_points: ['Chasing clients for payment', 'Making invoices by hand'], keywords: [], competitors: cfg.competitors };
const domain = domainWords(brand, cfg);
const post = (title: string | null, text: string) => ({ title, text, posted_at: new Date().toISOString() });

test('keywords match across plurals and word forms', () => {
  assert.equal(topicMatch(post(null, 'Any good invoicing apps for freelancers?'), cfg, domain)?.kind, 'keyword');
  assert.equal(topicMatch(post(null, 'Tired of chasing my clients for payments every month'), cfg, domain)?.term, 'chasing clients for payment');
});

test('posts that only share a word are dropped', () => {
  assert.equal(topicMatch(post('Ask HN: Why don\'t we bring back old school OkCupid?', 'The app had great matching.'), cfg, domain), null);
});

test('competitor names are case-sensitive and need two domain words', () => {
  assert.equal(topicMatch(post(null, 'So what wave of poptimism are we on now?'), cfg, domain), null);
  assert.equal(topicMatch(post(null, 'Figma restricts MCP access to whitelisted clients. Wave of changes.'), cfg, domain), null);
  assert.equal(topicMatch(post(null, 'Leaving Wave because client invoices keep bouncing. What else?'), cfg, domain)?.kind, 'competitor');
});

test('hiring threads are never leads', () => {
  assert.equal(topicMatch(post('Ask HN: Who is hiring? (October 2026)', 'We built an invoice app for clinics.'), cfg, domain), null);
});

test('someone asking scores above someone promoting', () => {
  const ask = post(null, 'Looking for an invoice app that works with WhatsApp. Any recommendations?');
  const promo = post(null, 'I built an invoice app that works with WhatsApp. Check out my launch.');
  const a = heuristicScore(ask, brand, topicMatch(ask, cfg, domain)!);
  const p = heuristicScore(promo, brand, topicMatch(promo, cfg, domain)!);
  assert.ok(a >= 60, `ask scored ${a}`);
  assert.ok(p < 40, `promo scored ${p}`);
});

test('queries include "alternative to" for each competitor and are capped', () => {
  const q = queriesFor(cfg);
  assert.ok(q.includes('alternative to Wave'));
  assert.ok(queriesFor({ keywords: Array.from({ length: 20 }, (_, i) => `k${i}`), competitors: [] }).length <= 12);
});
