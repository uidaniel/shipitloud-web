// Renders a sample "beats" video with every layout, to the given folder. No AI, no uploads.
import { readFileSync, writeFileSync } from 'node:fs';
import { renderBeats, type BeatsProps } from '../src/index.ts';

const out = process.argv[2] ?? '.';
const shot = process.argv[3] ? `data:image/png;base64,${readFileSync(process.argv[3]).toString('base64')}` : null;
const props: BeatsProps = {
  name: 'Balans', host: 'balans.ng', logo: 'https://balans.ng/apple-icon.png',
  theme: { bg: '#10231c', fg: '#F7F7F4', muted: '#A3A3B1', accent: '#fdbf2f', onAccent: '#0D0D12' },
  beats: [
    { layout: 'title', text: 'POV: your client said "will pay tomorrow" for the fourth time' },
    { layout: 'split', text: 'Invoicing', left: { label: 'Before', text: 'Word doc, PDF, chase on WhatsApp' }, right: { label: 'With Balans', text: 'Type the job in WhatsApp. Client pays from a link.' } },
    { layout: 'caption', text: 'Your client just opens a link', sub: 'No app. No account.', media: shot ? { kind: 'shot', src: shot } : null },
    { layout: 'list', text: 'Things that just make sense', items: ['Invoice the day you finish', 'Ask for a deposit', 'Remind on day 3'] },
    { layout: 'end', text: 'Get paid to your bank' },
  ],
};
const t = Date.now();
const buf = await renderBeats(props, 'story', { onProgress: (p) => process.stdout.write(`\r${Math.round(p * 100)}%`) });
writeFileSync(`${out}/beats-story.mp4`, buf);
console.log(`\n${(buf.length / 1e6).toFixed(1)}MB in ${Math.round((Date.now() - t) / 1000)}s`);
