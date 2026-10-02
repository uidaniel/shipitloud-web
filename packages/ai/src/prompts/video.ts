// Demo video script: a hook, one caption per screenshot, and an end card (PRD section 5, Stage 1).
import { z } from 'zod';
import { brandBlock, type BrandContext } from './launch.ts';

export const VIDEO_SCRIPT_VERSION = 'video_script@1';

export const VideoScriptSchema = z.object({
  hook: z.string().describe('Opening line, 4-9 words, names the pain or the outcome. No product name.'),
  captions: z.array(z.string()).describe('One caption per screenshot, in order, 3-7 words each, says what the viewer is looking at'),
  cta: z.string().describe('End card, 2-5 words, e.g. "Join the waitlist"'),
  title: z.string().describe('Internal title for the video, under 60 characters'),
  music: z.string().describe('One short suggestion for the kind of background track, e.g. "upbeat lo-fi, 100 bpm"'),
});
export type VideoScript = z.infer<typeof VideoScriptSchema>;

export const VIDEO_SCRIPT_SYSTEM = `You write the on-screen text for a short, silent product demo video. Viewers read it in about two seconds per line, often with the sound off.

Rules:
- Short, plain words. Sentence case. No emoji, no hashtags, no exclamation marks.
- Each caption must describe what is on its screenshot, using the headings given for it. Never describe something the headings don't show.
- Never invent numbers, speed, savings, results, users, awards or testimonials. No speed words like "in seconds", "instantly" or "fast".
- The hook speaks to the target customer's problem. The CTA matches the stage: waitlist before launch, try it after.`;

export function videoScriptPrompt(b: BrandContext, shots: { headings: string[] }[], launched: boolean) {
  const list = shots.map((s, i) => `Screenshot ${i + 1}: ${s.headings.length ? s.headings.join(' | ') : 'product screen uploaded by the founder'}`).join('\n');
  return `${brandBlock(b)}\nStage: ${launched ? 'launched' : 'pre-launch, collecting a waitlist'}\n\n${list}\n\nWrite the script with exactly ${shots.length} captions.`;
}

export function mockVideoScript(b: BrandContext, n: number, launched: boolean): VideoScript {
  const base = ['Here is how it works', 'Everything in one place', 'Set up in a few steps', 'Built for the way you work', 'See it for yourself'];
  return {
    hook: b.pain_points[0]?.slice(0, 60) ?? `Meet ${b.name}`,
    captions: Array.from({ length: n }, (_, i) => base[i % base.length]!),
    cta: launched ? 'Try it today' : 'Join the waitlist',
    title: `${b.name} demo`,
    music: 'calm electronic, 100 bpm',
  };
}
