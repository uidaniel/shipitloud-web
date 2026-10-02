import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_SHORTENER, findProductLinks, isBot, shortCode, tagLinksInText, withTracking } from './links.ts';

test('short codes use an unambiguous alphabet', () => {
  for (let i = 0; i < 200; i++) assert.match(shortCode(), /^[a-km-zA-HJ-NP-Z2-9]{7}$/);
});

test('tracking params are added without overwriting the site’s own', () => {
  const u = new URL(withTracking('https://balans.ng/pricing?utm_source=newsletter#plans', { source: 'x', campaign: 'launch', code: 'Ab3' }));
  assert.equal(u.searchParams.get('utm_source'), 'newsletter');
  assert.equal(u.searchParams.get('utm_medium'), 'social');
  assert.equal(u.searchParams.get('utm_campaign'), 'launch');
  assert.equal(u.searchParams.get('sil'), 'Ab3');
  assert.equal(u.hash, '#plans');
});

test('product links are found in any form; other sites and trailing punctuation are left alone', () => {
  const text = 'Try it: https://www.balans.ng/start. Or balans.ng, or http://balans.ng/pricing?x=1! Not otherbalans.ngx.com or example.com';
  assert.deepEqual(findProductLinks(text, 'https://balans.ng'), ['https://www.balans.ng/start', 'balans.ng', 'http://balans.ng/pricing?x=1']);
  assert.deepEqual(findProductLinks('no links here', 'https://balans.ng'), []);
  assert.deepEqual(findProductLinks('balans.ng', null), []);
});

test('link previews and scripts are not counted as clicks', () => {
  assert.ok(isBot('Twitterbot/1.0'));
  assert.ok(isBot('LinkedInBot/1.0 (compatible; Mozilla/5.0)'));
  assert.ok(isBot('WhatsApp/2.23.20.0 A'));
  assert.ok(isBot(null));
  assert.ok(!isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'));
});

test('a product domain inside another domain is not a product link', () => {
  assert.deepEqual(findProductLinks('see otherbalans.ngx.com and balans.nginx.io', 'https://balans.ng'), []);
  assert.deepEqual(findProductLinks('(balans.ng)', 'https://balans.ng'), ['balans.ng']);
});

test('links in communities that ban shorteners keep the real address, with UTM tags', () => {
  const out = tagLinksInText('I built this: balans.ng. Feedback welcome!', 'https://balans.ng', { source: 'reddit', medium: 'community' });
  assert.equal(out, 'I built this: https://balans.ng/?utm_source=reddit&utm_medium=community. Feedback welcome!');
  assert.ok(NO_SHORTENER.has('reddit') && NO_SHORTENER.has('hn') && !NO_SHORTENER.has('x'));
});
