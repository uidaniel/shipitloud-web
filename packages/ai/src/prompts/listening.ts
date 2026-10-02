// Listening: score found conversations in batches, then draft replies for the good ones (PRD section 6).
import { z } from 'zod';
import { brandBlock, type BrandContext } from './launch.ts';

export const LISTEN_SCORE_VERSION = 'listen_score@2';
export const LISTEN_REPLY_VERSION = 'listen_reply@1';

export const INTENTS = ['asking_for_tool', 'complaint', 'competitor_mention', 'discussion', 'other'] as const;

export const ScoreSchema = z.object({
  items: z.array(z.object({
    id: z.string().describe('The id given for the post'),
    relevance: z.number().int().describe('0-100: how likely a helpful reply mentioning the product would be welcome and useful here'),
    intent: z.enum(INTENTS),
    reason: z.string().describe('Under 10 words, why it scored this way'),
  })),
});
export type Scores = z.infer<typeof ScoreSchema>;

export const LISTEN_SCORE_SYSTEM = `You triage public posts for a founder looking for people who need their product.

Score each post 0-100 for how much a short, honest reply from the founder would help the poster:
- 80-100: the poster asks for a tool, workaround or recommendation the product directly provides, or is stuck on the exact problem it solves.
- 50-79: clearly the right audience and problem, but not asking; a helpful tip could naturally mention the product.
- 20-49: related topic only, or a competitor discussion where jumping in would feel like an ad.
- 0-19: unrelated, a job post, spam, or the poster is promoting their own product.
Judge the poster, not just the topic:
- Someone announcing, launching or promoting their own thing ("Show HN", "I built", "we launched", a product link) is not a lead: under 20, even if the topic matches exactly.
- Someone giving advice, sharing a lesson or a hot take is not asking for help: under 40, unless they also ask a direct question.
- A question to the reader that is really engagement bait ("what's hardest for you?") is under 50.
Be strict. Most posts score under 50. Never inflate scores.`;

export interface ScoreItem { id: string; source: string; title: string | null; text: string }

export function scorePrompt(b: BrandContext, items: ScoreItem[]) {
  const list = items.map((i) => `[${i.id}] (${i.source}) ${i.title ? `${i.title} — ` : ''}${i.text.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n\n');
  return `${brandBlock(b)}\n\nPosts:\n\n${list}\n\nScore every post.`;
}

export function mockScores(items: ScoreItem[]): Scores {
  return { items: items.map((i, n) => ({ id: i.id, relevance: [86, 72, 55, 34, 18][n % 5]!, intent: n % 2 ? 'complaint' : 'asking_for_tool', reason: 'Sample score (mock mode)' })) };
}

export const ReplySchema = z.object({
  reply: z.string().describe('The reply, 40-120 words, plain text'),
  mentions_product: z.boolean().describe('True if the reply names the product'),
});
export type Reply = z.infer<typeof ReplySchema>;

export const LISTEN_REPLY_SYSTEM = `You draft a reply the founder will post under their own name in a public conversation.

Rules:
- Help first. Answer the actual question or give one concrete, useful tip in the first sentences.
- Mention the product only if it truly solves what they asked, at most once, and say plainly that you built it ("I built X, which does ..."). Never pretend to be a neutral user.
- No links unless the poster asked for tools; then at most one, the product's site.
- Match the platform: Hacker News is plain, technical and allergic to marketing; Bluesky and X are short and casual; GitHub is precise and on-topic.
- Never invent features, prices, numbers, customers or results. Only use facts from the brand block.
- No hashtags, no emoji, no exclamation marks, no em dashes, no "Great question". It must read like a person typed it.
- Write in the founder's voice.`;

export function replyPrompt(b: BrandContext, m: { source: string; title: string | null; text: string; author: string | null }) {
  return `${brandBlock(b)}\n\nPlatform: ${m.source}\nPost by ${m.author ?? 'someone'}:\n${m.title ? `${m.title}\n` : ''}${m.text.slice(0, 1500)}\n\nDraft the reply.`;
}

export function mockReply(b: BrandContext): Reply {
  return { reply: `Sample reply (mock mode). One practical tip for this exact problem first, then: I built ${b.name}, which handles this. Happy to answer questions.`, mentions_product: true };
}
