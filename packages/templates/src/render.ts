import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { contrast, kmeans, type Theme } from './color.ts';
import { FORMATS, templateById, type FormatId } from './templates.tsx';

// geist exposes no resolvable entry for Node, so walk up to node_modules/geist.
const fontDir = (() => {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++, d = dirname(d)) {
    const f = join(d, 'node_modules', 'geist', 'dist', 'fonts', 'geist-sans');
    if (existsSync(f)) return f;
  }
  throw new Error('Geist fonts not found (is the geist package installed?)');
})();
type FontList = { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }[];
let fonts: FontList | null = null;
function loadFonts() {
  return (fonts ??= [
    { name: 'Geist', data: readFileSync(join(fontDir, 'Geist-Regular.ttf')), weight: 400, style: 'normal' },
    { name: 'Geist', data: readFileSync(join(fontDir, 'Geist-SemiBold.ttf')), weight: 600, style: 'normal' },
    { name: 'Geist', data: readFileSync(join(fontDir, 'Geist-Bold.ttf')), weight: 700, style: 'normal' },
  ]);
}

// ---------------------------------------------------------------- brand fonts
// The brand's own typeface when it's on Google Fonts (detected from the site's CSS); Geist otherwise.
const SYSTEM_FONTS = /^(system-ui|-apple-system|blinkmacsystemfont|ui-|sans-serif|serif|monospace|arial|helvetica|segoe ui|roboto mono|geist|inherit|var\()/i;
const brandFontCache = new Map<string, Promise<FontList | null>>();

export function loadBrandFont(family: string | null | undefined): Promise<FontList | null> {
  const name = (family ?? '').replace(/["']/g, '').split(',')[0]!.trim();
  if (!name || SYSTEM_FONTS.test(name) || name.length > 40) return Promise.resolve(null);
  if (!brandFontCache.has(name)) {
    brandFontCache.set(name, (async () => {
      try {
        // No browser user agent, so Google serves TrueType, which Satori can read.
        const get = async (url: string, tries = 2): Promise<Response> => {
          try { return await fetch(url, { signal: AbortSignal.timeout(15_000) }); } catch (e) { if (tries > 1) return get(url, tries - 1); throw e; }
        };
        const css = await (await get(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;600;700`)).text();
        const faces = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/g)];
        if (!faces.length) return null;
        const out: FontList = [];
        for (const [, weight, url] of faces) {
          const w = Number(weight);
          if (![400, 600, 700].includes(w)) continue;
          const data = Buffer.from(await (await get(url!)).arrayBuffer());
          out.push({ name: 'Geist', data, weight: w as 400 | 600 | 700, style: 'normal' }); // registered under the templates' font name
        }
        return out.length ? out : null;
      } catch { return null; }
    })());
  }
  // Don't remember failures (often a network blip), so the next render tries again.
  const p = brandFontCache.get(name)!;
  p.then((f) => { if (!f) brandFontCache.delete(name); });
  return p;
}

export interface RenderInput {
  templateId: string;
  format: FormatId;
  slots: Record<string, string>;
  theme: Theme;
  brand: { name: string; url?: string | null; logo?: string | null };
  /** Use the brand's font (Google Fonts family name) instead of Geist when available. */
  fontFamily?: string | null;
}

export interface QaResult {
  score: number;      // 0-100
  issues: string[];   // human-readable; any "blocker" issue sends the asset back
  blocker: boolean;
}

/** Deterministic checks before rendering: required slots, length limits, contrast. No model call, no cost. */
export function qa(input: RenderInput): QaResult {
  const t = templateById(input.templateId);
  if (!t) return { score: 0, issues: ['Unknown template'], blocker: true };
  const issues: string[] = [];
  let score = 100;
  for (const [key, slot] of Object.entries(t.slots)) {
    const v = (input.slots[key] ?? '').trim();
    if (slot.required && !v) { issues.push(`Missing ${slot.label.toLowerCase()}`); score -= 40; }
    if (v.length > slot.max) { issues.push(`${slot.label} is ${v.length - slot.max} characters too long`); score -= 25; }
  }
  if (input.slots.highlight && input.slots.headline && !input.slots.headline.toLowerCase().includes(input.slots.highlight.toLowerCase())) {
    issues.push('Highlighted words are not in the headline'); score -= 10;
  }
  const textContrast = contrast(input.theme.fg, input.theme.bg);
  const accentContrast = contrast(input.theme.onAccent, input.theme.accent);
  if (textContrast < 4.5) { issues.push(`Text contrast ${textContrast.toFixed(1)}:1 is below 4.5:1`); score -= 30; }
  if (accentContrast < 4.5) { issues.push(`Highlight contrast ${accentContrast.toFixed(1)}:1 is below 4.5:1`); score -= 15; }
  if (!input.brand.logo) { issues.push('No logo yet'); score -= 5; }
  score = Math.max(0, Math.min(100, score));
  return { score, issues, blocker: score < 60 };
}

export async function renderPng(input: RenderInput): Promise<Buffer> {
  const t = templateById(input.templateId);
  if (!t) throw new Error(`Unknown template ${input.templateId}`);
  const { w, h } = FORMATS[input.format];
  const brandFonts = input.fontFamily ? await loadBrandFont(input.fontFamily) : null;
  const svg = await satori(t.render({ slots: input.slots, theme: input.theme, brand: input.brand, w, h }), { width: w, height: h, fonts: brandFonts ?? loadFonts() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng());
}

/** Fetch a logo (PNG, SVG, ICO...) and return it as a PNG data URI plus its dominant colors. */
export async function prepareLogo(url: string): Promise<{ dataUri: string; palette: string[] } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3_000_000) return null;
    const png = await sharp(buf, { density: 300 }).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const { data, info } = await sharp(png).resize(64, 64, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const palette = kmeans(data, info.channels, 5).map((c) => c.color);
    return { dataUri: `data:image/png;base64,${png.toString('base64')}`, palette };
  } catch {
    return null;
  }
}
