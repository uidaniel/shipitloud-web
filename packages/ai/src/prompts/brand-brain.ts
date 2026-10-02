// Brand brain (PRD section 4, step 2): from the product's own site, draft what a marketer needs.
import { z } from 'zod';

export const BRAND_BRAIN_VERSION = 'brand_brain@1';

export const BrandBrainSchema = z.object({
  one_liner: z.string().describe('What the product does, in under 12 words, plain language'),
  summary: z.string().describe('2-3 sentences: what it is, who it is for, why it is different'),
  category: z.string().describe('Short product category, e.g. "invoicing tool for freelancers"'),
  target_customer: z.string().describe('The specific person who buys or uses it, 1-2 sentences'),
  pain_points: z.array(z.string()).describe('3-6 problems the customer has that this solves, in their words'),
  keywords: z.array(z.string()).describe('6-12 phrases people would search or post when they need this'),
  competitors: z.array(z.string()).describe('2-6 named alternatives people use today (products or workarounds)'),
  content_pillars: z.array(z.string()).describe('3-4 recurring content themes for this brand'),
  voice: z.object({
    tone: z.string().describe('3-5 words, e.g. "warm, direct, a bit cheeky"'),
    style_notes: z.string().describe('2-3 sentences on how this brand writes'),
    do: z.array(z.string()).describe('3-5 writing habits to keep'),
    dont: z.array(z.string()).describe('3-5 things to avoid'),
  }),
  confidence: z.number().describe('0-100: how sure you are, given how much the site actually said'),
});
export type BrandBrain = z.infer<typeof BrandBrainSchema>;

export const BRAND_BRAIN_SYSTEM = `You are the marketing co-founder for a solo technical founder. From the text of their product's website, write the brand brain that every later post, reply and ad will be based on.

Rules:
- Use only what the site says or clearly implies. Do not invent features, prices, customers or results.
- Write the way the customer talks, not marketing jargon. Short, concrete, specific.
- Pain points are problems in the customer's own words ("I chase clients for payment every month"), not features.
- Keywords are phrases real people type or post when they have the problem, including "alternative to <competitor>" style phrases when competitors are known.
- Competitors are real named products or the workaround people use today (e.g. "spreadsheets"). If you can't tell, give the most likely category leaders and lower your confidence.
- If the site says very little, still fill every field with your best reading and set confidence below 50.`;

export function brandBrainPrompt(input: { name: string; url: string | null; description: string | null; pages: { url: string; title: string; text: string }[] }) {
  const parts = [`Product name: ${input.name}`];
  if (input.url) parts.push(`Website: ${input.url}`);
  if (input.description) parts.push(`Founder's own description:\n${input.description}`);
  for (const p of input.pages) parts.push(`--- Page: ${p.url}\nTitle: ${p.title}\n${p.text}`);
  return parts.join('\n\n');
}

export function mockBrandBrain(name: string): BrandBrain {
  return {
    one_liner: `${name} helps founders do the job faster`,
    summary: `${name} is a tool for small teams. (Mock output: set ANTHROPIC_API_KEY for a real brand brain.)`,
    category: 'software tool',
    target_customer: 'Solo founders and small teams who are short on time.',
    pain_points: ['Too much manual work', 'Hard to stay consistent', 'No time to learn new tools'],
    keywords: [`${name.toLowerCase()} alternative`, 'save time', 'automate busywork', 'small team tools', 'founder productivity', 'simple workflow'],
    competitors: ['Spreadsheets', 'Notion'],
    content_pillars: ['Product updates', 'Tips for the audience', 'Behind the scenes'],
    voice: { tone: 'friendly, direct, practical', style_notes: 'Short sentences. Talks like a founder to another founder.', do: ['Be specific', 'Use plain words', 'Show, don’t tell'], dont: ['Hype', 'Jargon', 'Fake urgency'] },
    confidence: 20,
  };
}
