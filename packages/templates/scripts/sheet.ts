// Dev helper: renders a contact sheet of posters for a brand. Usage: npx tsx scripts/sheet.ts <outDir>
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { prepareLogo, renderPng, themeFromPalette } from '../src/index.ts';

const out = (process.argv[2] ?? '.').replace(/\/?$/, '/');
const logo = await prepareLogo('https://balans.ng/apple-icon.png');
console.log('palette from logo:', logo?.palette);
const theme = themeFromPalette(['#10231C', ...(logo?.palette ?? [])]);
console.log('theme:', theme);
const brand = { name: 'Balans', url: 'https://balans.ng', logo: logo?.dataUri ?? null };
const jobs: [string, 'portrait' | 'square' | 'landscape' | 'story', Record<string, string>][] = [
  ['announce', 'portrait', { kicker: 'Live today', headline: 'Invoice from WhatsApp. Get paid to your bank.', highlight: 'Get paid', sub: 'Type the job and the amount. Your client pays straight into your account.' }],
  ['feature', 'portrait', { label: 'Receipts', headline: 'Receipts go out the moment you get paid', points: 'No app for your client\nNaira, dollars or pounds\nOne tap to share' }],
  ['countdown', 'portrait', { number: '3', unit: 'days to go', line: 'Join the waitlist and be first in.' }],
  ['problem', 'portrait', { before: 'Chasing clients for payment every month', after: 'Clients pay from one link, receipt goes out' }],
  ['steps', 'portrait', { title: 'Get paid in three steps', step1: 'Type the job and amount', step2: 'Client opens the link', step3: 'Money lands in your bank' }],
  ['cta', 'portrait', { headline: 'Stop chasing payments.', highlight: 'chasing', button: 'Join the waitlist' }],
];
const tiles: Buffer[] = [];
for (const [id, f, slots] of jobs) {
  const png = await renderPng({ templateId: id, format: f, slots, theme, brand });
  writeFileSync(`${out}${id}-${f}.png`, png);
  tiles.push(await sharp(png).resize(480, 600, { fit: 'contain', background: '#222' }).png().toBuffer());
}
await sharp({ create: { width: 480 * 3 + 40, height: 600 * 2 + 20, channels: 3, background: '#222' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % 3) * 500, top: Math.floor(i / 3) * 620 }))).png().toFile(`${out}sheet.png`);
console.log('ok');
