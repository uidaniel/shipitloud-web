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
