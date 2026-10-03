// Ad creatives (PRD section 6 "Autonomous ads", section 15 "Ad claims"): copy for Meta and Google ads. Images are
// rendered from the brand kit by templates; the model only writes words, and the policy pre-check runs on them.
import { z } from 'zod';
import { brandBlock, type BrandContext } from './launch.ts';

export const AD_COPY_VERSION = 'ad_copy@1';
export const META_CTAS = ['SIGN_UP', 'LEARN_MORE', 'GET_STARTED', 'DOWNLOAD', 'SUBSCRIBE', 'TRY_IT'] as const;

const Variant = z.object({
  angle: z.string().describe('The idea behind this ad in 3-6 words, e.g. "stop chasing payments"'),
  headline: z.string().describe('Under 40 characters: the main line under the image'),
  primary_text: z.string().describe('The text above the image: 1-3 short sentences, under 125 characters ideally'),
  description: z.string().describe('Under 30 characters, a short supporting line'),
  image_headline: z.string().describe('Under 40 characters, the words ON the image: short, bold, no punctuation clutter'),
  image_highlight: z.string().describe('1-3 words from image_headline to highlight, copied exactly, or empty'),
  cta: z.enum(META_CTAS),
});
export const AdCopySchema = z.object({ variants: z.array(Variant).min(1).max(4) });
export type AdCopy = z.infer<typeof AdCopySchema>;

export const AD_COPY_SYSTEM = `You write paid social ads for a small product. Each variant tries a different angle (the pain, the outcome, how it works, who it's for) so the test can find what works.

Rules (these keep ads approved and honest):
- Only facts from the brand block. Never invent numbers, users, reviews, ratings, awards, prices, discounts or deadlines.
- Never imply something personal about the viewer ("Are you in debt?", "Struggling with anxiety?"). Talk about the problem, not the person.
- No guarantees of income or results, no "risk-free", no before/after, no fake urgency, no ALL CAPS, no "!!", no emoji, no em dashes.
- Plain words a busy person reads in two seconds.`;

export const adCopyPrompt = (b: BrandContext, o: { goal: string; n: number; avoid?: string[] }) =>
  `${brandBlock(b)}\n\nCampaign goal: ${o.goal === 'traffic' ? 'visits to the site' : o.goal === 'installs' ? 'app installs' : 'signups'}.\n${o.avoid?.length ? `Already running (try different angles): ${o.avoid.join('; ')}\n` : ''}\nWrite ${o.n} ad variant${o.n === 1 ? '' : 's'}.`;

export function mockAdCopy(b: BrandContext, n: number): AdCopy {
  const angles = ['the pain', 'the outcome', 'how it works', 'who it is for'];
  return {
    variants: Array.from({ length: n }, (_, i) => ({
      angle: `Sample angle ${i + 1}: ${angles[i % 4]}`,
      headline: `${b.name}: sample ${i + 1}`.slice(0, 40),
      primary_text: `Sample ad text (mock mode), variant ${i + 1}.`,
      description: 'Sample line',
      image_headline: `Sample headline ${i + 1}`,
      image_highlight: 'Sample',
      cta: i === 0 ? 'SIGN_UP' : 'LEARN_MORE',
    })),
  };
}
