import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStoreUrl, needsQuestions, parseStoreUrl, storeLinkWithCampaign } from './appstore.ts';

test('store links are recognised', () => {
  assert.deepEqual(parseStoreUrl('https://apps.apple.com/gb/app/balans/id1234567890'), { store: 'apple', id: '1234567890', country: 'gb' });
  assert.deepEqual(parseStoreUrl('apps.apple.com/app/id987654321'), { store: 'apple', id: '987654321', country: 'us' });
  assert.deepEqual(parseStoreUrl('https://play.google.com/store/apps/details?id=com.balans.app&hl=en'), { store: 'google', id: 'com.balans.app', country: 'us' });
  assert.equal(parseStoreUrl('https://balans.ng'), null);
  assert.equal(parseStoreUrl('https://play.google.com/store/search?q=x'), null);
  assert.ok(isStoreUrl('https://apps.apple.com/us/app/x/id123456'));
});

test('store links carry the channel so installs are credited', () => {
  const apple = new URL(storeLinkWithCampaign('https://apps.apple.com/us/app/balans/id1234567890?mt=8', { source: 'tiktok', campaign: 'launch' }));
  assert.equal(apple.searchParams.get('ct'), 'tiktok-launch');
  assert.equal(apple.searchParams.get('pt'), null);
  const play = new URL(storeLinkWithCampaign('https://play.google.com/store/apps/details?id=com.balans.app', { source: 'reels' }));
  assert.equal(new URLSearchParams(play.searchParams.get('referrer')!).get('utm_source'), 'reels');
  assert.equal(storeLinkWithCampaign('https://balans.ng', { source: 'x' }), 'https://balans.ng');
});

test('the 3 questions: always for apps, only thin websites otherwise', () => {
  assert.equal(needsQuestions({ isApp: true, words: 2000 }), true);
  assert.equal(needsQuestions({ isApp: false, words: 90 }), true);
  assert.equal(needsQuestions({ isApp: false, words: 900 }), false);
});
