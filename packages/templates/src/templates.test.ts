import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, kmeans, themeFromPalette } from './color.ts';
import { qa, renderPng } from './render.ts';
import { FORMATS, TEMPLATES } from './templates.tsx';

const theme = themeFromPalette(['#10231C', '#F2B33D']);
const brand = { name: 'Balans', url: 'https://balans.ng', logo: null };
const sample: Record<string, Record<string, string>> = {
  announce: { kicker: 'Live today', headline: 'Invoice from WhatsApp. Get paid to your bank.', highlight: 'Get paid', sub: 'Type the job and the amount. Your client pays straight into your account.' },
  feature: { label: 'Receipts', headline: 'Receipts go out the moment you get paid', points: 'No app for your client\nNaira, dollars or pounds\nOne tap to share' },
  countdown: { number: '3', unit: 'days to go', line: 'Join the waitlist and be first in.' },
  stat: { number: '32', label: 'freelancers on the waitlist', note: 'Week one, no ads.' },
  problem: { before: 'Chasing clients for payment every month', after: 'Clients pay from one link, receipt goes out' },
  steps: { title: 'Get paid in three steps', step1: 'Type the job and amount', step2: 'Client opens the link', step3: 'Money lands in your bank' },
  quote: { quote: 'Getting paid should be the easiest part of freelancing, not the hardest.', by: 'Founder, Balans' },
  cta: { headline: 'Stop chasing payments.', highlight: 'chasing', button: 'Join the waitlist' },
};

test('contrast math matches WCAG', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF')), 21);
  assert.ok(contrast('#F7F7F4', '#10231C') > 12);
});

test('theme always gives readable text and highlight', () => {
  for (const pal of [['#10231C', '#F2B33D'], ['#FFFF00'], [], ['#5B3DF5', '#C6FF3D']]) {
    const t = themeFromPalette(pal);
    assert.ok(contrast(t.fg, t.bg) >= 4.5, `fg on bg for ${pal}`);
    assert.ok(contrast(t.onAccent, t.accent) >= 4.5, `onAccent for ${pal}`);
  }
});

test('k-means finds the dominant colors and ignores white', () => {
  const px = Buffer.alloc(100 * 4);
  for (let i = 0; i < 100; i++) {
    const c = i < 60 ? [242, 179, 61] : i < 90 ? [16, 35, 28] : [255, 255, 255];
    px.set([...c, 255], i * 4);
  }
  const out = kmeans(px, 4, 3).map((c) => c.color);
  assert.ok(out.some((c) => c.toLowerCase() === '#f2b33d'));
  assert.ok(!out.some((c) => c.toLowerCase() === '#ffffff'));
});

test('QA flags overlong and missing text', () => {
  const bad = qa({ templateId: 'countdown', format: 'square', slots: { number: '1234', unit: '', line: 'x' }, theme, brand });
  assert.ok(bad.blocker);
  assert.ok(bad.issues.some((i) => i.includes('too long')));
  const good = qa({ templateId: 'countdown', format: 'square', slots: sample.countdown!, theme, brand });
  assert.ok(!good.blocker && good.score >= 90);
});

test('every template renders in every format', async () => {
  for (const t of TEMPLATES) {
    for (const f of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
      const png = await renderPng({ templateId: t.id, format: f, slots: sample[t.id]!, theme, brand });
      assert.ok(png.length > 5000, `${t.id}/${f} rendered`);
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
    }
  }
});
