// Builds the extension into dist/ (load it with chrome://extensions → Load unpacked).
// `--dev` points it at http://localhost:3001 and allows that host.
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'dist');
const dev = process.argv.includes('--dev');
const api = dev ? 'http://localhost:3001' : 'https://shipitloud.netlify.app';
const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'icons'), { recursive: true });

await build({
  entryPoints: { background: 'src/background.ts', content: 'src/content.ts', popup: 'src/popup.ts' },
  absWorkingDir: dir, outdir: out, bundle: true, format: 'esm', target: 'chrome120', minify: !dev, sourcemap: dev ? 'inline' : false,
  banner: { js: `globalThis.__SIL_API__ = ${JSON.stringify(api)};` },
});
// Content scripts can't be ES modules: rebuild that one as an IIFE.
await build({
  entryPoints: ['src/content.ts'], absWorkingDir: dir, outfile: path.join(out, 'content.js'), bundle: true, format: 'iife', target: 'chrome120', minify: !dev,
  banner: { js: `globalThis.__SIL_API__ = ${JSON.stringify(api)};` },
});
await copyFile(path.join(dir, 'src/popup.html'), path.join(out, 'popup.html'));

// Icons from the PRD's "Play loud" mark (section 20): 16, 32, 48, 128 px.
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const svg = await readFile(path.join(dir, '../web/app/icon.svg'));
for (const s of [16, 32, 48, 128]) await sharp(svg, { density: 384 }).resize(s, s).png().toFile(path.join(out, 'icons', `${s}.png`));

const icons = { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' };
const manifest = {
  manifest_version: 3,
  name: 'ShipItLoud',
  version: pkg.version,
  description: 'Find Reddit posts worth replying to, draft replies in your voice, and check community rules before you post.',
  icons,
  action: { default_popup: 'popup.html', default_icon: icons, default_title: 'ShipItLoud' },
  background: { service_worker: 'background.js', type: 'module' },
  permissions: ['storage'],
  host_permissions: ['https://www.reddit.com/*', 'https://old.reddit.com/*', 'https://shipitloud.netlify.app/*', 'https://app.shipitloud.com/*', ...(dev ? ['http://localhost:3001/*'] : [])],
  content_scripts: [{ matches: ['https://www.reddit.com/*', 'https://old.reddit.com/*'], js: ['content.js'], run_at: 'document_idle' }],
};
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`built ${dev ? 'dev' : 'production'} extension → ${path.relative(process.cwd(), out)} (API ${api})`);
