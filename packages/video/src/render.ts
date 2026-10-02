import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { DemoProps, VideoFormat } from './types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

function fontsDir() {
  for (let dir = here; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const p = path.join(dir, 'node_modules', 'geist', 'dist', 'fonts', 'geist-sans');
    if (existsSync(p)) return p;
  }
  throw new Error('Geist fonts not found');
}

// Bundling takes a few seconds; do it once per process.
let bundled: Promise<string> | null = null;
function serveUrl() {
  bundled ??= bundle({ entryPoint: path.join(here, 'remotion', 'index.tsx'), publicDir: fontsDir() });
  return bundled;
}

/** Renders one cut to MP4 and returns the bytes. Videos are muted; music is suggested, not baked in. */
export async function renderVideo(props: DemoProps, format: VideoFormat, opts: { onProgress?: (p: number) => void } = {}): Promise<Buffer> {
  const url = await serveUrl();
  const composition = await selectComposition({ serveUrl: url, id: `demo-${format}`, inputProps: props });
  const dir = await mkdtemp(path.join(tmpdir(), 'sil-video-'));
  const out = path.join(dir, `${format}.mp4`);
  try {
    await renderMedia({
      composition, serveUrl: url, codec: 'h264', outputLocation: out, inputProps: props, muted: true,
      crf: 23, concurrency: Number(process.env.VIDEO_CONCURRENCY ?? 2), timeoutInMilliseconds: 60_000,
      browserExecutable: process.env.VIDEO_BROWSER || null,
      onProgress: ({ progress }) => opts.onProgress?.(progress),
    });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
