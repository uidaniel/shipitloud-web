// Weekly digest wording (PRD section 6 "weekly digest", section 9 "first 7 days report"). The numbers and the next
// actions are worked out in code; the model only says what happened and what worked, in plain words.
import { z } from 'zod';

export const DIGEST_VERSION = 'digest@1';

export const DigestSchema = z.object({
  summary: z.string().describe('2-3 short sentences: what happened this week, in plain words, with the key numbers'),
  worked: z.array(z.string()).max(3).describe('Up to 3 things that worked, one sentence each. Empty if nothing clearly worked.'),
});
export type DigestCopy = z.infer<typeof DigestSchema>;

export const DIGEST_SYSTEM = `You write the short weekly note a growth assistant sends a founder about their product's week.

Rules:
- Use only the numbers in the facts block, written as digits, exactly as given. Never estimate, round, add up or invent a number, a percentage or a trend.
- "What worked" means something the facts show: a channel that brought signups, a link people clicked, more of something than the week before. If nothing clearly worked, return an empty list. Don't stretch.
- If it was a quiet week, say so plainly and kindly. No hype, no "great job", no exclamation marks, no emoji, no em dashes.
- Talk to the founder as "you". Short sentences.`;

export const digestPrompt = (product: string, facts: string) => `Product: ${product}\n\n${facts}\n\nWrite the summary and what worked.`;

export const mockDigest = (facts: string): DigestCopy => ({
  summary: `Sample summary (mock mode). ${facts.split('\n')[1]?.replace(/^- /, '') ?? ''}`.trim(),
  worked: [],
});
