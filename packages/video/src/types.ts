export interface VideoTheme { bg: string; fg: string; muted: string; accent: string; onAccent: string }

/** One screenshot beat. `desktop` goes in a browser frame, `mobile` in a phone frame; either may be missing. */
export interface Shot { caption: string; desktop?: string | null; mobile?: string | null }

export interface DemoProps {
  [key: string]: unknown;
  name: string;
  host: string | null;
  logo: string | null;
  theme: VideoTheme;
  hook: string;
  shots: Shot[];
  cta: string;
}

export const VIDEO_FORMATS = {
  story: { width: 1080, height: 1920, label: '9:16' },
  square: { width: 1080, height: 1080, label: '1:1' },
  landscape: { width: 1920, height: 1080, label: '16:9' },
} as const;
export type VideoFormat = keyof typeof VIDEO_FORMATS;

export const FPS = 30;
export const T = { intro: 45, hook: 84, shot: 108, cta: 96, fade: 10 } as const;

/** 1 + 1 + n + 1 beats; with 2–5 shots this lands between ~15s and ~27s. */
export function durationFrames(shots: number) {
  return T.intro + T.hook + Math.max(1, shots) * T.shot + T.cta;
}

// ---------------------------------------------------------------- short-form "beats" (UGC format remix)
export type Media = { kind: 'video' | 'image' | 'shot'; src: string };
export type Beat =
  | { layout: 'title'; text: string; media?: Media | null }
  | { layout: 'caption'; text: string; sub?: string; media?: Media | null }
  | { layout: 'split'; text?: string; left: { label: string; text: string }; right: { label: string; text: string } }
  | { layout: 'list'; text: string; items: string[] }
  | { layout: 'end'; text: string };

export interface BeatsProps {
  [key: string]: unknown;
  name: string;
  host: string | null;
  logo: string | null;
  theme: VideoTheme;
  beats: Beat[];
}

const words = (s = '') => s.split(/\s+/).filter(Boolean).length;

/** How long a beat stays on screen: long enough to read (about 0.4s a word), never under 2s or over 6s. */
export function beatFrames(b: Beat): number {
  const w = b.layout === 'split' ? words(b.text) + words(b.left.text) + words(b.right.text) + 2
    : b.layout === 'list' ? words(b.text) + b.items.reduce((n, i) => n + words(i), 0) + b.items.length
    : words(b.text) + words((b as { sub?: string }).sub);
  const seconds = b.layout === 'end' ? 2.6 : Math.min(6, Math.max(2.2, 0.8 + w * 0.4));
  return Math.round(seconds * FPS);
}

export const beatsFrames = (beats: Beat[]) => beats.reduce((n, b) => n + beatFrames(b), 0) || FPS * 3;
