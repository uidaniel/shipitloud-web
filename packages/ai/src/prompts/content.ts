// Content engine (PRD section 6, 16): a week of posts from pillars, product updates and listening insights,
// written from proven formats in the founder's own voice. Plus repurposing and voice learning.
import { z } from 'zod';
import { brandBlock, type BrandContext } from './launch.ts';

export const CONTENT_WEEK_VERSION = 'content_week@1';
export const CONTENT_FORMAT_VERSION = 'content_format@1';
export const REPURPOSE_VERSION = 'repurpose@1';
export const VOICE_LEARN_VERSION = 'voice_learn@1';

export interface FormatSpec { slug: string; name: string; platforms: string[]; hook_pattern: string; structure: string; example: string; needs: string | null }
export interface WeekInputs {
  pillars: string[];
  samples: string[];                                      // the founder's own past posts
  updates: { ref: string; title: string; body: string }[];
  insights: string[];                                     // what people asked or complained about this week (paraphrased)
  formats: FormatSpec[];
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;

const PostSchema = z.object({
  title: z.string().describe('Internal title, under 60 characters'),
  pillar: z.string().describe('Which content pillar this serves'),
  platform: z.enum(['x', 'linkedin']),
  format_slug: z.string().describe('Slug of the format used, from the list'),
  day: z.enum(DAYS),
  source: z.enum(['update', 'listening', 'pillar']),
  source_ref: z.string().describe('The update ref when source is update, else empty'),
  text: z.string().describe('The post. For an X thread, the first post only.'),
  thread: z.array(z.string()).describe('For X threads: every post in order (2-5), each under 270 characters. Empty for single posts and LinkedIn.'),
  needs_input: z.boolean().describe('True if the post contains a [bracketed placeholder] the founder must fill with a real fact'),
});

export const WeekSchema = z.object({
  posts: z.array(PostSchema).describe('5 posts: 3 for X, 2 for LinkedIn, one per weekday'),
  whatsapp_status: z.string().describe('One short WhatsApp status (under 300 characters) for the week'),
});
export type Week = z.infer<typeof WeekSchema>;

const RULES = `Writing rules:
- Write as the founder, first person, in their voice. If sample posts are given, match their length, rhythm and words; don't copy them.
- Use only facts that are given: the brand block, the product updates, the past posts. Never invent numbers, percentages, users, customers, beta testers, conversations, quotes, past events, results, or plans for future features.
- No absolute promises ("works every time", "every freelancer", "always"). Say what the product does, not what it guarantees.
- If a format needs a real fact you don't have (a metric, a story, what a user said), write a [bracketed placeholder] like [what a user told you] and set needs_input to true.
- Plain words. No hashtags (one at most on LinkedIn), no emoji (one at most), no em dashes, no "excited to announce", no buzzwords like game-changer, revolutionize, unlock, leverage, seamless.
- X: each post under 270 characters. LinkedIn: 500-1300 characters, short paragraphs, a strong first line.
- Every post must be useful or interesting even to someone who never buys.`;

export const CONTENT_WEEK_SYSTEM = `You are the founder's content partner. Plan and write one week of posts.

Planning rules:
- 5 posts: 3 on X and 2 on LinkedIn, Monday to Friday, one per day.
- Use a different format for each post, from the formats given. Mix the content pillars.
- If product updates are given, at least one post (at most two) is about them, using source "update" and its ref.
- If listening insights are given, at least one post answers what people are asking, using source "listening". Never name or quote the people.

${RULES}`;

export function contentWeekPrompt(b: BrandContext, w: WeekInputs) {
  return `${brandBlock(b)}
Content pillars: ${w.pillars.join('; ') || 'product updates; tips for the audience; behind the scenes; customer stories'}

${w.samples.length ? `The founder's past posts (match this voice):\n${w.samples.slice(0, 5).map((s, i) => `--- ${i + 1}\n${s.slice(0, 700)}`).join('\n')}\n` : 'No past posts yet: write plainly and directly.\n'}
Product updates since last week:
${w.updates.length ? w.updates.map((u) => `[${u.ref}] ${u.title}${u.body ? `: ${u.body.slice(0, 400)}` : ''}`).join('\n') : 'none'}

What people asked or complained about this week:
${w.insights.length ? w.insights.map((i) => `- ${i}`).join('\n') : 'none'}

Formats to use:
${w.formats.map((f) => `- ${f.slug} (${f.platforms.join('/')}): ${f.name}. Hook: ${f.hook_pattern}. Structure: ${f.structure}${f.needs ? ` Needs: ${f.needs}.` : ''}`).join('\n')}

Write the week.`;
}

export function mockWeek(b: BrandContext, w: WeekInputs): Week {
  const plan: ('x' | 'linkedin')[] = ['x', 'linkedin', 'x', 'linkedin', 'x'];
  return {
    posts: plan.map((platform, i) => {
      const f = w.formats[i % Math.max(1, w.formats.length)];
      const upd = i === 0 ? w.updates[0] : undefined;
      return {
        title: `${f?.name ?? 'Post'} (sample)`, pillar: w.pillars[i % Math.max(1, w.pillars.length)] ?? 'tips', platform, format_slug: f?.slug ?? 'how-to-steps',
        day: DAYS[i]!, source: upd ? 'update' : i === 1 && w.insights.length ? 'listening' : 'pillar', source_ref: upd?.ref ?? '',
        text: platform === 'x' ? `Sample post (mock mode) for ${b.name}. ${upd ? `Shipped: ${upd.title}.` : 'One useful tip for your audience.'}` : `Sample LinkedIn post (mock mode) for ${b.name}.\n\nA short story, a lesson, and a question to close.\n\nWhat would you add?`,
        thread: [], needs_input: false,
      };
    }),
    whatsapp_status: `Sample status (mock mode): ${b.name} this week.`,
  };
}

// ---------------------------------------------------------------- one post from a chosen format
export const FromFormatSchema = z.object({ platform: z.enum(['x', 'linkedin']), text: z.string(), thread: z.array(z.string()), needs_input: z.boolean(), title: z.string() });
export type FromFormat = z.infer<typeof FromFormatSchema>;
export const CONTENT_FORMAT_SYSTEM = `Write one post for the founder using the given format, adapted to their product and voice.\n\n${RULES}`;
export function fromFormatPrompt(b: BrandContext, f: FormatSpec, platform: 'x' | 'linkedin', samples: string[], topic: string) {
  return `${brandBlock(b)}\n${samples.length ? `\nThe founder's past posts (match this voice):\n${samples.slice(0, 3).map((s) => `---\n${s.slice(0, 600)}`).join('\n')}\n` : ''}
Format: ${f.name}. Hook: ${f.hook_pattern}. Structure: ${f.structure}. Example of the shape (don't copy it): ${f.example}${f.needs ? `\nNeeds: ${f.needs}` : ''}
Platform: ${platform}
${topic ? `Topic: ${topic}` : ''}

Write the post.`;
}
export function mockFromFormat(b: BrandContext, f: FormatSpec, platform: 'x' | 'linkedin'): FromFormat {
  return { platform, title: `${f.name} (sample)`, text: `Sample ${f.name.toLowerCase()} post (mock mode) for ${b.name}.`, thread: [], needs_input: false };
}

// ---------------------------------------------------------------- repurpose one post into others
export const RepurposeSchema = z.object({
  x_thread: z.array(z.string()).describe('3-5 X posts, each under 270 characters'),
  linkedin: z.string().describe('LinkedIn post, 500-1300 characters'),
  whatsapp: z.string().describe('WhatsApp status, under 300 characters'),
  poster: z.object({ template_id: z.string(), title: z.string(), slots: z.array(z.object({ key: z.string(), value: z.string() })) }),
});
export type Repurposed = z.infer<typeof RepurposeSchema>;
export const REPURPOSE_SYSTEM = `Turn one idea into a thread, a LinkedIn post, a WhatsApp status and one poster. Keep the substance; change the shape for each platform.
For the poster, pick the best template from the list and fill its slots within their character limits. Only use words and facts from the original.

${RULES}`;
export function repurposePrompt(b: BrandContext, original: { platform: string; text: string }, posterTemplates: { id: string; name: string; slots: Record<string, { label: string; max: number; required?: boolean }> }[]) {
  return `${brandBlock(b)}

Original (${original.platform}):
${original.text.slice(0, 3000)}

Poster templates:
${posterTemplates.map((t) => `- ${t.id} (${t.name}): ${Object.entries(t.slots).map(([k, s]) => `${k} = ${s.label}, max ${s.max}${s.required ? ', required' : ''}`).join('; ')}`).join('\n')}

Repurpose it.`;
}
export function mockRepurpose(b: BrandContext): Repurposed {
  return {
    x_thread: [`Sample thread (mock mode) about ${b.name}, part 1.`, 'Part 2: the useful bit.', 'Part 3: what to do next.'],
    linkedin: `Sample LinkedIn version (mock mode) for ${b.name}.\n\nSame idea, longer shape.\n\nWhat do you think?`,
    whatsapp: `Sample status (mock mode) for ${b.name}.`,
    poster: { template_id: 'quote', title: 'Repurposed poster (sample)', slots: [{ key: 'quote', value: `Sample line for ${b.name}` }, { key: 'by', value: b.name }] },
  };
}

// ---------------------------------------------------------------- voice learning
export const VoiceLearnSchema = z.object({
  tone: z.string().describe('3-6 words describing the voice'),
  style_notes: z.string().describe('2-3 sentences on how they write: length, rhythm, words they use, how they open and close'),
  dos: z.array(z.string()).describe('3-6 concrete habits to keep'),
  donts: z.array(z.string()).describe('3-6 things they never do'),
});
export type VoiceLearned = z.infer<typeof VoiceLearnSchema>;
export const VOICE_LEARN_SYSTEM = `Describe how this founder writes, from their own posts, so drafts can sound like them. Be specific and observable (sentence length, openings, punctuation, words they favour), not generic ("friendly", "engaging").`;
export const voiceLearnPrompt = (samples: string[]) => `Their posts:\n\n${samples.slice(0, 12).map((s, i) => `--- ${i + 1}\n${s.slice(0, 1200)}`).join('\n')}\n\nDescribe the voice.`;
export const mockVoice = (): VoiceLearned => ({ tone: 'plain, direct, a bit dry', style_notes: 'Sample voice notes (mock mode). Short sentences, opens with the point.', dos: ['Open with the point', 'Use real numbers'], donts: ['No hashtags', 'No hype words'] });
