// Color utilities: parsing, WCAG contrast, palette extraction (k-means on logo pixels), and theme building.
export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB | null {
  const m = hex.trim().replace('#', '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.split('').map((c) => c + c).join('') : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const rgbToHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function lum([r, g, b]: RGB) {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** WCAG contrast ratio, 1-21. */
export function contrast(a: string, b: string): number {
  const x = hexToRgb(a), y = hexToRgb(b);
  if (!x || !y) return 1;
  const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

function saturation([r, g, b]: RGB) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** k-means on RGBA pixels; skips transparent and near-white/near-black background pixels. */
export function kmeans(pixels: Uint8Array | Buffer, channels: number, k = 5): { color: string; weight: number }[] {
  const pts: RGB[] = [];
  for (let i = 0; i < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3]! < 128) continue;
    const p: RGB = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    const l = lum(p);
    if (l > 0.93) continue; // white background
    pts.push(p);
  }
  if (!pts.length) return [];
  const centers: RGB[] = Array.from({ length: Math.min(k, pts.length) }, (_, i) => [...pts[Math.floor((i * pts.length) / k)]!] as RGB);
  const assign = new Array<number>(pts.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    pts.forEach((p, i) => {
      let best = 0, bd = Infinity;
      centers.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) { bd = d; best = j; }
      });
      assign[i] = best;
    });
    centers.forEach((_, j) => {
      const mine = pts.filter((_, i) => assign[i] === j);
      if (mine.length) centers[j] = [0, 1, 2].map((c) => mine.reduce((s, p) => s + p[c]!, 0) / mine.length) as RGB;
    });
  }
  const counts = centers.map((_, j) => assign.filter((a) => a === j).length);
  return centers.map((c, j) => ({ color: rgbToHex(c), weight: counts[j]! / pts.length }))
    .filter((c) => c.weight > 0.02)
    .sort((a, b) => b.weight - a.weight);
}

export interface Theme {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  onAccent: string;
}

/**
 * Build a poster theme from the brand palette: a dark or light ground, the brand's most vivid color as accent,
 * and text colors that always pass WCAG AA contrast.
 */
export function themeFromPalette(palette: string[], mode: 'dark' | 'light' = 'dark'): Theme {
  const cols = palette.map((p) => ({ hex: p, rgb: hexToRgb(p) })).filter((c): c is { hex: string; rgb: RGB } => !!c.rgb);
  const vivid = [...cols].sort((a, b) => saturation(b.rgb) - saturation(a.rgb))[0]?.hex ?? '#5B3DF5';
  const darkest = [...cols].sort((a, b) => lum(a.rgb) - lum(b.rgb))[0];
  const bg = mode === 'dark'
    ? (darkest && lum(darkest.rgb) < 0.06 ? darkest.hex : '#0D0D12')
    : '#F5F5F2';
  const fg = mode === 'dark' ? '#F7F7F4' : '#0D0D12';
  let accent = vivid;
  if (contrast(accent, bg) < 3) accent = mode === 'dark' ? '#F7F7F4' : '#0D0D12';
  const onAccent = contrast('#0D0D12', accent) >= contrast('#FFFFFF', accent) ? '#0D0D12' : '#FFFFFF';
  const muted = mode === 'dark' ? '#A3A3B1' : '#55555F';
  return { bg, fg, muted, accent, onAccent };
}
