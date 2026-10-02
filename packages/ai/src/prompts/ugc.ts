// UGC engine level 1 (PRD section 22): find formats for the niche, then remix one into a faceless video or a carousel.
import { z } from 'zod';
import { brandBlock, type BrandContext } from './launch.ts';

export const UGC_FORMATS_VERSION = 'ugc_formats@1';
export const UGC_VIDEO_VERSION = 'ugc_video@1';
export const UGC_CAROUSEL_VERSION = 'ugc_carousel@1';

export interface BaseFormat { slug: string; kind: string; name: string; hook_pattern: string; structure: string; example: string }

export const NicheFormatsSchema = z.object({
  formats: z.array(z.object({
    base_slug: z.string().describe('The library format it adapts'),
    kind: z.enum(['video', 'carousel']),
    name: z.string().describe('Short name, e.g. "POV: the client who pays in 3 instalments"'),
    hook_pattern: z.string().describe('The reusable hook, with [brackets] for the parts that change'),
    structure: z.string().describe('Beats or slides, in one or two sentences'),
    example: z.string().describe('A full example for this niche, on-screen text only'),
    why: z.string().describe('Under 20 words: why this lands with this audience'),
  })).describe('10-12 formats'),
});
export type NicheFormats = z.infer<typeof NicheFormatsSchema>;

const HONEST = `- Faceless: on-screen text over the founder's screenshots, brand motion or stock footage. Nobody speaks to camera.
- Never write lines as if a real customer said them (no fake reviews or testimonials, no "I switched and now..." from a "user"). POV and skit lines speak to the viewer ("POV: you...") or describe a situation.
- Use only facts from the brand block about the product. No invented numbers, results, prices or features.
- No em dashes, no emoji, no hashtags inside on-screen text.`;

export const UGC_FORMATS_SYSTEM = `You adapt proven short-video and carousel formats to one founder's niche, so their audience instantly recognises the situation.

Rules:
- Base every format on one from the library given; keep what makes it work, change the situation to this audience's real life and problems.
- At least 7 videos and 3 carousels. Each must be makeable with screenshots, simple motion and text.
- Examples must not contain made-up numbers, statistics, speeds, prices or payment methods. Where a number would help, write [your real number].
${HONEST}`;

export function nicheFormatsPrompt(b: BrandContext, library: BaseFormat[]) {
  return `${brandBlock(b)}

Library formats:
${library.map((f) => `- ${f.slug} (${f.kind}): ${f.name}. Hook: ${f.hook_pattern}. Structure: ${f.structure}. Example: ${f.example}`).join('\n')}

Adapt them for this audience.`;
}

export function mockNicheFormats(library: BaseFormat[]): NicheFormats {
  return { formats: Array.from({ length: 10 }, (_, i) => {
    const f = library[i % Math.max(1, library.length)]!;
    return { base_slug: f.slug, kind: f.kind === 'carousel' ? 'carousel' : 'video', name: `${f.name} for your niche (sample ${i + 1})`, hook_pattern: f.hook_pattern, structure: f.structure, example: `${f.example} (sample)`, why: 'Sample (mock mode)' };
  }) };
}

// ---------------------------------------------------------------- video remix
const MEDIA = ['none', 'shot', 'broll'] as const;
export const VideoRemixSchema = z.object({
  idea: z.string().describe('One line: what this video is about'),
  hooks: z.array(z.string()).describe('Exactly 3 different opening lines (the first beat), each under 12 words, each a different angle'),
  beats: z.array(z.object({
    layout: z.enum(['title', 'caption', 'split', 'list', 'end']),
    text: z.string().describe('On-screen text, under 14 words'),
    sub: z.string().describe('Optional smaller line for a caption beat, else empty'),
    items: z.array(z.string()).describe('For list beats: 3-4 short items; else empty'),
    left_label: z.string(), left_text: z.string(), right_label: z.string(), right_text: z.string(),
    media: z.enum(MEDIA).describe('shot = a founder screenshot behind this beat, broll = stock footage, none = brand motion'),
    broll_query: z.string().describe('If media is broll: 2-4 word stock footage search, e.g. "woman typing phone"; else empty'),
  })).describe('4-7 beats. The first beat is replaced by each hook. The last beat has layout "end" with a 2-5 word call to action.'),
  caption: z.string().describe('Post caption, 1-3 short sentences, no hashtags inside'),
  hashtags: z.array(z.string()).describe('0-3 relevant hashtags without #'),
  audio: z.string().describe('A kind of trending or royalty-free sound that fits, e.g. "upbeat lo-fi"'),
});
export type VideoRemix = z.infer<typeof VideoRemixSchema>;

export const UGC_VIDEO_SYSTEM = `You write a faceless short video (Reels, TikTok, Shorts) from a proven format, for one founder's product.

Rules:
- Follow the format's structure. Keep it 10-20 seconds: 4-7 beats, very few words per beat, readable at a glance.
- Three hooks, three angles (for example the pain, the surprise, the outcome). Each must make the viewer stay for the second beat.
- Use "shot" media only when screenshots are available and the beat shows the product. Use "broll" only when stock footage is allowed.
- The end beat is a short call to action, nothing else.
${HONEST}`;

export function videoRemixPrompt(b: BrandContext, f: { name: string; hook_pattern: string; structure: string; example: string }, footage: { shots: number; broll: boolean }, topic = '') {
  return `${brandBlock(b)}

Format: ${f.name}. Hook: ${f.hook_pattern}. Structure: ${f.structure}. Example: ${f.example}
Footage: ${footage.shots ? `${footage.shots} product screenshots available` : 'no screenshots'}; stock footage ${footage.broll ? 'allowed' : 'not available'}.
${topic ? `Topic: ${topic}` : ''}

Write the video.`;
}

export function mockVideoRemix(b: BrandContext, shots: number): VideoRemix {
  const empty = { sub: '', items: [], left_label: '', left_text: '', right_label: '', right_text: '', broll_query: '' };
  return {
    idea: `Sample remix for ${b.name}`,
    hooks: ['POV: sample hook one (mock)', 'Sample hook two (mock)', 'Sample hook three (mock)'],
    beats: [
      { ...empty, layout: 'title', text: 'Hook', media: 'none' },
      { ...empty, layout: 'split', text: 'Sample', left_label: 'Before', left_text: 'The old way', right_label: `With ${b.name}`, right_text: 'The new way', media: 'none' },
      { ...empty, layout: 'caption', text: 'Sample caption beat', sub: 'Mock mode', media: shots ? 'shot' : 'none' },
      { ...empty, layout: 'end', text: `Try ${b.name}`, media: 'none' },
    ],
    caption: `Sample caption (mock mode) for ${b.name}.`, hashtags: ['sample'], audio: 'upbeat lo-fi',
  };
}

// ---------------------------------------------------------------- carousel remix
export const CarouselRemixSchema = z.object({
  idea: z.string(),
  slides: z.array(z.object({ title: z.string().describe('Under 10 words'), body: z.string().describe('Under 30 words, may be empty on the cover') })).describe('5-8 slides: a cover with the hook, the points, then a last slide with the call to action'),
  caption: z.string(),
  hashtags: z.array(z.string()),
});
export type CarouselRemix = z.infer<typeof CarouselRemixSchema>;
export const UGC_CAROUSEL_SYSTEM = `You write an Instagram or LinkedIn carousel from a proven format for one founder's product. One idea per slide, big and readable.\n\n${HONEST}`;
export const carouselRemixPrompt = (b: BrandContext, f: { name: string; hook_pattern: string; structure: string; example: string }, topic = '') =>
  `${brandBlock(b)}\n\nFormat: ${f.name}. Hook: ${f.hook_pattern}. Structure: ${f.structure}. Example: ${f.example}\n${topic ? `Topic: ${topic}\n` : ''}\nWrite the carousel.`;
export function mockCarousel(b: BrandContext): CarouselRemix {
  return { idea: 'Sample carousel', slides: [{ title: 'Sample hook (mock)', body: '' }, { title: 'Point one', body: 'Sample body.' }, { title: 'Point two', body: 'Sample body.' }, { title: 'Point three', body: 'Sample body.' }, { title: `Try ${b.name}`, body: b.one_liner ?? '' }], caption: 'Sample caption (mock mode).', hashtags: [] };
}
