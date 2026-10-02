// Renders sample carousel slides (Geist and a brand font) into one sheet for review.
import sharp from 'sharp';
import { renderPng, themeFromPalette } from '../src/index.ts';

const out = process.argv[2] ?? '.';
const theme = themeFromPalette(['#10231c', '#fdbf2f']);
const brand = { name: 'Balans', url: 'https://balans.ng', logo: null };
const slides: [string, Record<string, string>][] = [
  ['slide-cover', { kicker: 'For freelancers', title: '5 mistakes that keep your invoices unpaid', page: '1/6' }],
  ['slide-point', { num: '01', title: 'You invoice at the end', body: 'Send it the day you finish, while the work is fresh in their mind.', page: '2/6' }],
  ['slide-end', { title: 'Invoice from WhatsApp', body: 'Your client pays from a link, straight to your bank.', page: '6/6' }],
];
const imgs: Buffer[] = [];
for (const font of [null, 'Fraunces']) {
  for (const [id, slots] of slides) imgs.push(await sharp(await renderPng({ templateId: id, format: 'portrait', slots, theme, brand, fontFamily: font })).resize(360).png().toBuffer());
}
await sharp({ create: { width: 3 * 370, height: 2 * 460, channels: 3, background: '#444' } })
  .composite(imgs.map((input, i) => ({ input, left: (i % 3) * 370, top: Math.floor(i / 3) * 460 }))).png().toFile(`${out}/carousel-sheet.png`);
console.log('ok');
