import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageOf, parseListing, parseMe, parseRecent, parseRules, parseThread } from './reddit.ts';

const post = (over: Record<string, unknown> = {}) => ({ kind: 't3', data: { name: 't3_abc', subreddit: 'SaaS', title: 'Any invoice app?', selftext: 'Looking for one', author: 'ada', permalink: '/r/SaaS/comments/abc/any_invoice_app/', created_utc: 1790000000, num_comments: 3, ...over } });

test('page kinds and their JSON urls', () => {
  const t = pageOf('https://www.reddit.com/r/SaaS/comments/1ww08qg/over_2000_impressions/');
  assert.equal(t.kind, 'thread');
  assert.equal(t.kind === 'thread' && t.id, 't3_1ww08qg');
  assert.equal(t.kind === 'thread' && t.jsonUrl, 'https://www.reddit.com/r/SaaS/comments/1ww08qg/over_2000_impressions.json?limit=1');
  const l = pageOf('https://www.reddit.com/r/SaaS/new/');
  assert.equal(l.kind === 'listing' && l.jsonUrl, 'https://www.reddit.com/r/SaaS/new.json?limit=25');
  const s = pageOf('https://www.reddit.com/search/?q=invoice+app&type=posts');
  assert.equal(s.kind, 'listing');
  assert.match(s.kind === 'listing' ? s.jsonUrl : '', /^https:\/\/www\.reddit\.com\/search\.json\?q=invoice\+app&type=posts&limit=25&sort=new$/);
  assert.equal(pageOf('https://www.reddit.com/settings/').kind, 'other');
});

test('listing parsing skips stickies, ads and non-posts', () => {
  const json = { kind: 'Listing', data: { children: [post(), post({ name: 't3_sticky', stickied: true }), post({ name: 't3_ad', promoted: true }), { kind: 't5', data: {} }] } };
  const posts = parseListing(json);
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.url, 'https://www.reddit.com/r/SaaS/comments/abc/any_invoice_app/');
  assert.equal(posts[0]!.text, 'Looking for one');
});

test('thread parsing reads the first listing; old reddit links point to www', () => {
  const p = parseThread([{ kind: 'Listing', data: { children: [post({ locked: true })] } }, { kind: 'Listing', data: { children: [] } }], 'https://old.reddit.com');
  assert.equal(p?.id, 't3_abc');
  assert.equal(p?.locked, true);
  assert.match(p!.url, /^https:\/\/www\.reddit\.com\//);
});

test('me: logged out gives null; karma totals', () => {
  assert.equal(parseMe({}), null);
  assert.deepEqual(parseMe({ data: { name: 'ada', link_karma: 10, comment_karma: 32, created_utc: 1700000000 } }), { name: 'ada', karma: 42, created_utc: 1700000000 });
});

test('recent activity spots removals in posts and comments', () => {
  const items = parseRecent({ data: { children: [
    { kind: 't1', data: { subreddit: 'SaaS', body: '[removed]' } },
    { kind: 't1', data: { subreddit: 'SaaS', body: 'fine', removed_by_category: 'moderator' } },
    { kind: 't3', data: { subreddit: 'startups', title: 'My launch', selftext: 'hi', url: 'https://balans.ng' } },
  ] } });
  assert.deepEqual(items.map((i) => i.removed), [true, true, false]);
  assert.equal(items[2]!.url, 'https://balans.ng');
});

test('rules parsing keeps names and descriptions', () => {
  assert.deepEqual(parseRules({ rules: [{ short_name: 'No self-promotion', description: 'No ads' }, { description: 'nameless' }] }), [{ short_name: 'No self-promotion', description: 'No ads' }]);
});
