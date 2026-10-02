import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditHints, extractPage, onPage } from './page-audit.ts';

const weak = `<!doctype html><html><head><title>Flowly</title><script>var x = "<h1>nope</h1>";</script></head><body>
<nav><a href="/login">Log in</a><a href="/blog">Blog</a></nav>
<h1>Supercharge your workflow with the next-gen all-in-one platform</h1>
<p>Flowly empowers teams.</p>
<a class="btn btn-primary" href="/start">Learn more</a>
<button>Submit</button>
</body></html>`;

const strong = `<html><head><title>Balans | Invoices from WhatsApp</title><meta name="description" content="Send an invoice from WhatsApp in a minute and get paid to your bank account."></head><body>
<header><a href="/pricing">Pricing</a></header>
<h1>Invoice clients from WhatsApp, get paid to your bank</h1>
<h2>How it works</h2><p>Type the amount, pick a client, and Balans sends a payment link they can pay by transfer or card. We remind them for you so you don&rsquo;t have to chase.</p>
<form><input type="email" name="email"><button type="submit">Join the waitlist</button></form>
<a class="cta" href="#">Get early access</a>
<section><blockquote>“I stopped chasing payments.” Ada, designer in Lagos</blockquote><p>Used by 1,200 freelancers</p></section>
<footer><a href="/privacy">Privacy</a> <a href="mailto:hi@balans.ng">Contact</a> Built by two founders in Lagos. Cancel any time.</footer>
</body></html>`;

test('extracts what a visitor sees and ignores scripts', () => {
  const p = extractPage(strong);
  assert.equal(p.h1[0], 'Invoice clients from WhatsApp, get paid to your bank');
  assert.deepEqual(p.ctas, ['Join the waitlist', 'Get early access']);
  assert.equal(p.forms, 1);
  assert.match(p.text, /so you don't have to chase/);
  assert.deepEqual(p.trust, { testimonials: true, logos: false, numbers: true, pricing: true, privacy: true, refund: true, security: false, contact: true, reviews: false, founder: true });
  assert.deepEqual(extractPage('<h1><span>S</span><span>h</span><span>i</span><span>p</span> <em>it</em></h1>').h1, ['Ship it']);
  assert.deepEqual(extractPage('<h1><span>You built it.</span><span>Ship it loud.</span></h1>').h1, ['You built it. Ship it loud.']);
  assert.deepEqual(extractPage(weak).h1, ['Supercharge your workflow with the next-gen all-in-one platform']);
});

test('hints name the problems a weak page has, and stay quiet on a good one', () => {
  const h = auditHints(extractPage(weak));
  const areas = (a: string) => h.filter((x) => x.area === a).map((x) => x.issue);
  assert.ok(areas('clarity').some((i) => i.includes('"Supercharge"')));
  assert.ok(areas('clarity').some((i) => i.includes('No meta description')));
  assert.ok(areas('cta').some((i) => i.includes('"Learn more"')));
  assert.ok(areas('cta').some((i) => i.includes('no email form')));
  assert.ok(areas('trust').some((i) => i.includes('No social proof')));
  assert.deepEqual(auditHints(extractPage(strong)), []);
});

test('quotes must really be on the page', () => {
  const p = extractPage(strong);
  assert.ok(onPage('invoice clients from whatsapp', p));
  assert.ok(onPage('"I stopped chasing payments."', p));
  assert.ok(!onPage('Trusted by 10,000 businesses', p));
  assert.ok(!onPage('a', p));
});

test('rewrites must be copy, not advice; long quotes are shortened', async () => {
  const { isInstruction, shortQuote } = await import('./page-audit.ts');
  assert.ok(isInstruction('Add an email input field with placeholder text "your email" and a button labeled "Get updates"'));
  assert.ok(!isInstruction('Get early access'));
  assert.ok(!isInstruction('Find people already asking for what you built, and reply in your voice.'));
  const long = 'Paste your link. ShipItLoud does the rest: Reads your product Your site becomes a brand brain: customer, voice, competitors. Writes your posts Launch threads and replies, in your voice.';
  const s = shortQuote(long);
  assert.ok(s.length <= 161 && s.endsWith('…') && long.startsWith(s.slice(0, -1)));
  assert.equal(shortQuote('Short one'), 'Short one');
});
