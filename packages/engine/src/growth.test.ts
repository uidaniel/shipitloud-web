import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountsFor, channelPlan, growthScore, presenceFrom, urlHint } from './growth.ts';

test('the channel plan differs by product type (acceptance 4)', () => {
  const saas = channelPlan('b2b_saas', { stage: 'growing' });
  const app = channelPlan('consumer_app', { stage: 'growing' });
  const lead = (p: typeof saas) => p.filter((c) => c.role === 'lead' && c.enabled).map((c) => c.id);
  assert.deepEqual(lead(saas), ['linkedin', 'seo', 'hn', 'email']);
  assert.deepEqual(lead(app), ['tiktok', 'reels', 'ugc', 'creators']);
  assert.notDeepEqual(lead(saas), lead(app));
  assert.equal(saas.find((c) => c.id === 'tiktok')?.enabled, false, 'poor fit shown, switched off');
  assert.ok(saas.every((c, i) => c.rank === i + 1 && c.reason.length > 10));
  assert.deepEqual(lead(channelPlan('dev_tool', { stage: 'growing' })), ['hn', 'github', 'reddit', 'technical']);
});

test('stage and plan adjust the playbook', () => {
  const pre = channelPlan('b2b_saas', { stage: 'pre_launch' });
  assert.equal(pre[0]!.id, 'waitlist', 'pre-launch: collect signups first');
  assert.equal(channelPlan('b2b_saas', { stage: 'growing', fit: 'launching_soon' })[0]!.id, 'waitlist');
  const ads = (plan?: string) => channelPlan('ecommerce', { stage: 'growing', plan }).find((c) => c.id === 'ads')!;
  assert.equal(ads('grow').enabled, false);
  assert.match(ads('grow').reason, /Scale/);
  assert.equal(ads('scale').enabled, true);
  assert.equal(channelPlan('consumer_app', { stage: 'growing' }).find((c) => c.id === 'aso')!.enabled, false);
  assert.equal(channelPlan('consumer_app', { stage: 'growing', hasAppStore: true }).find((c) => c.id === 'aso')!.enabled, true);
});

test('only accounts for enabled channels are requested (acceptance 5)', () => {
  const plan = channelPlan('b2b_saas', { stage: 'growing' });
  assert.deepEqual(accountsFor(plan), ['linkedin', 'x']);
  const off = plan.map((c) => (c.id === 'x' ? { ...c, enabled: false } : c));
  assert.deepEqual(accountsFor(off), ['linkedin']);
  assert.deepEqual(accountsFor(channelPlan('dev_tool', { stage: 'growing' })), ['github', 'reddit', 'x']);
});

test('presence and URL hints', () => {
  const p = presenceFrom(`<a href="https://x.com/balansng">X</a><a href="https://www.linkedin.com/company/balans">in</a><a href="/blog/how">Blog</a><a href="https://www.producthunt.com/posts/balans">PH</a><script src="https://plausible.io/js/script.js"></script><a href="https://x.com/intent/tweet">share</a>`);
  assert.deepEqual(p.socials, ['x', 'linkedin']);
  assert.ok(p.blog && p.analytics);
  assert.deepEqual(p.reviews, ['Product Hunt']);
  assert.equal(urlHint('https://apps.apple.com/us/app/balans/id123'), 'consumer_app');
  assert.equal(urlHint('https://github.com/vercel/next.js'), 'dev_tool');
  assert.equal(urlHint('https://balans.ng'), null);
});

test('growth score rewards what we can fix, out of 100', () => {
  const empty = presenceFrom('');
  const low = growthScore({ pageIssues: { clarity: 3, cta: 2, trust: 4 }, presence: empty, hasPricing: false, hasEmailForm: false, competitorsKnown: 0 });
  const high = growthScore({ pageIssues: { clarity: 0, cta: 0, trust: 0 }, presence: { ...empty, socials: ['x', 'linkedin', 'github'], blog: true, reviews: ['G2'], analytics: true }, hasPricing: true, hasEmailForm: true, competitorsKnown: 3 });
  assert.ok(low.score < 20, `low ${low.score}`);
  assert.ok(high.score >= 95, `high ${high.score}`);
  assert.equal(high.parts.reduce((n, p) => n + p.of, 0), 100);
});

test('predicted numbers are scrubbed; real ones stay', async () => {
  const { scrubNumbers } = await import('./growth.ts');
  const site = 'Plans from $49 a month. 30-day plan included.';
  assert.equal(scrubNumbers('Your product is already mentioned; a Show HN post would find 50+ high-intent users.', site), 'Your product is already mentioned.');
  assert.equal(scrubNumbers('Lead with your $49 price and the 30-day plan.', site), 'Lead with your $49 price and the 30-day plan.');
  assert.equal(scrubNumbers('One clear button doubles click-through rate.', site), '');
  assert.equal(scrubNumbers('Post how you built it in 14 days.', site), '');
  assert.equal(scrubNumbers('Add a quote from a real user. It gives people a reason to trust you.', site), 'Add a quote from a real user. It gives people a reason to trust you.');
});
