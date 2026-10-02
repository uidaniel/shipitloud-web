// Captures homepage sections for the demo video and writes them to a folder. No AI, no uploads.
import { writeFile } from 'node:fs/promises';
import { captureSite } from '../src/video.ts';

const [url = 'https://balans.ng', out = '.'] = process.argv.slice(2);
const caps = await captureSite(url);
for (const [i, c] of caps.entries()) {
  if (c.desktop) await writeFile(`${out}/cap-${i}-d.jpg`, c.desktop);
  if (c.mobile) await writeFile(`${out}/cap-${i}-m.jpg`, c.mobile);
  console.log(i, c.headings, !!c.mobile);
}
