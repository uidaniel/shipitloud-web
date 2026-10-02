// Renders the three cuts with sample props to the scratchpad. No AI, no uploads.
import { writeFile } from 'node:fs/promises';
import { renderVideo, type DemoProps } from '../src/index.ts';

const out = process.argv[2] ?? '.';
import { readFileSync } from 'node:fs';
const shot = (f?: string) => (f ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : null);
const props: DemoProps = {
  name: 'Balans', host: 'balans.ng', logo: 'https://balans.ng/apple-icon.png',
  theme: { bg: '#10231c', fg: '#F7F7F4', muted: '#A3A3B1', accent: '#fdbf2f', onAccent: '#0D0D12' },
  hook: 'Still chasing clients on WhatsApp to get paid?',
  shots: [
    { caption: 'Send an invoice right from WhatsApp', desktop: shot(process.argv[3]), mobile: shot(process.argv[4]) },
    { caption: 'Clients pay without installing anything', desktop: shot(process.argv[3]), mobile: shot(process.argv[4]) },
  ],
  cta: 'Join the waitlist',
};
for (const f of (process.argv[5] ?? 'story,square,landscape').split(',') as ('story')[]) {
  const t = Date.now();
  const buf = await renderVideo(props, f, { onProgress: (p) => process.stdout.write(`\r${f} ${Math.round(p * 100)}%`) });
  await writeFile(`${out}/demo-${f}.mp4`, buf);
  console.log(`\n${f}: ${(buf.length / 1e6).toFixed(1)}MB in ${((Date.now() - t) / 1000).toFixed(0)}s`);
}
