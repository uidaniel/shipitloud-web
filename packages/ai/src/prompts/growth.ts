// Growth analysis (PRD section 23): understand the product from its site and say, in plain words, where its users
// will come from. Channel plan and score are worked out in code from these answers.
import { z } from 'zod';

export const GROWTH_VERSION = 'growth_analysis@2';

export const GrowthSchema = z.object({
  summary: z.string().describe('What it does, in 1-2 plain sentences'),
  problem: z.string().describe('The problem it solves, in the customer’s words, one sentence'),
  product_type: z.enum(['b2b_saas', 'consumer_app', 'dev_tool', 'marketplace', 'ecommerce', 'other']).describe('b2b_saas: businesses pay for software; consumer_app: individuals use it, often mobile; dev_tool: developers are the users; marketplace: connects two sides; ecommerce: sells physical goods'),
  stage: z.enum(['pre_launch', 'just_launched', 'growing']).describe('pre_launch if the site is a waitlist or "coming soon"; growing only if the site shows real traction'),
  pricing_model: z.string().describe('One of: free, freemium, free trial, subscription, one-time, usage-based, unknown'),
  ideal_customer: z.string().describe('The specific person most likely to sign up first, one sentence'),
  hangouts: z.array(z.string()).min(2).max(5).describe('Specific places that person spends time online, e.g. "r/freelance", "Indie Hackers", "LinkedIn", "Nigerian tech Twitter"'),
  positioning: z.string().describe('One line: for [who], [product] is the [category] that [key benefit], unlike [main alternative]. Under 30 words.'),
  competitor_gaps: z.array(z.object({
    competitor: z.string(),
    how_they_market: z.string().describe('How this competitor is generally known to get users, one short sentence. If you are not sure, say "Not sure".'),
    gap: z.string().describe('An opening this product can use, one sentence'),
  })).max(4),
  page_fixes: z.array(z.object({
    area: z.enum(['clarity', 'cta', 'trust']),
    fix: z.string().describe('What to change, concretely, one sentence'),
    why: z.string().describe('Why it gets more signups, one short sentence'),
  })).length(3).describe('The top 3 landing page fixes, one for each area'),
  opportunities: z.array(z.object({ title: z.string().describe('Under 8 words'), why: z.string().describe('One sentence, specific to this product') })).length(3).describe('The 3 biggest ways to get users soon'),
  search_phrases: z.array(z.string()).min(2).max(4).describe('2-4 short phrases (2-3 words) people write in forums when they have this problem or need this kind of product, e.g. "invoice app", "chasing payments"'),
  sample_post: z.string().describe('One launch post the founder could publish today, in the voice the site uses, under 260 characters, no hashtags, no emoji, only facts from the site'),
});
export type Growth = z.infer<typeof GrowthSchema>;

export const GROWTH_SYSTEM = `You are a growth partner for a solo founder. From their product's website, work out who will use it first, where those people are, and the fastest ways to reach them.

Rules:
- Plain words. No marketing jargon ("leverage", "synergy", "omnichannel", "funnel optimization"). Short sentences.
- Only what the site says or clearly implies about the product. Never invent features, prices, users or results.
- Competitors: real named products the site's customers would otherwise use. What you say about how they market is your general read, not a fact; if unsure, say "Not sure".
- Page fixes come from what's actually on the page (the detected issues help). Each is something the founder can do today.
- Opportunities are specific to this product, not generic advice like "post on social media".
- Never predict results or invent numbers: no "50+ users", "doubles clicks", "first 100 users in 30 days", "built in 14 days". Only numbers that appear on the site.
- Nothing that breaks platform rules: no bots, auto-replies, fake accounts or mass messaging.
- page_fixes: exactly one for clarity, one for cta, one for trust.
- search_phrases: two everyday words each, the way people write in forums ("invoice app", "launch checklist"), not marketing phrases.
- No em dashes.`;

export function growthPrompt(i: { name: string; url: string; fit: string | null; pages: { url: string; title: string; text: string }[]; page: { title: string; description: string; h1: string[]; ctas: string[]; forms: number }; hints: string[]; presence: Record<string, unknown> }) {
  return [
    `Product: ${i.name}`, `Website: ${i.url}`,
    i.fit ? `The founder says: ${i.fit === 'launching_soon' ? 'launching soon' : i.fit === 'already_live' ? 'already live, needs users' : 'just exploring'}` : '',
    `Landing page: title "${i.page.title}", headline "${i.page.h1.join(' | ') || 'none'}", buttons: ${i.page.ctas.join(' | ') || 'none'}, email forms: ${i.page.forms}, meta description: "${i.page.description || 'none'}"`,
    `Issues our checks found: ${i.hints.length ? i.hints.join('; ') : 'none'}`,
    `What the site shows about presence: ${JSON.stringify(i.presence)}`,
    ...i.pages.map((p) => `--- Page: ${p.url}\nTitle: ${p.title}\n${p.text}`),
  ].filter(Boolean).join('\n\n');
}

export function mockGrowth(name: string, type: Growth['product_type'] = 'b2b_saas'): Growth {
  return {
    summary: `${name} (sample analysis, mock mode).`,
    problem: 'Sample problem (mock mode).',
    product_type: type, stage: 'just_launched', pricing_model: 'unknown',
    ideal_customer: 'Sample customer (mock mode).', hangouts: ['LinkedIn', 'Indie Hackers'],
    positioning: `For small teams, ${name} is the sample tool that saves time, unlike spreadsheets.`,
    competitor_gaps: [{ competitor: 'Spreadsheets', how_they_market: 'Not sure', gap: 'Sample gap (mock mode).' }],
    page_fixes: [
      { area: 'clarity', fix: 'Sample fix: say who it is for in the headline.', why: 'Visitors decide in seconds.' },
      { area: 'cta', fix: 'Sample fix: one main button.', why: 'One choice gets more clicks.' },
      { area: 'trust', fix: 'Sample fix: add a real quote.', why: 'People trust people.' },
    ],
    opportunities: [{ title: 'Sample opportunity 1', why: 'Mock mode.' }, { title: 'Sample opportunity 2', why: 'Mock mode.' }, { title: 'Sample opportunity 3', why: 'Mock mode.' }],
    search_phrases: ['invoice app', 'side project'],
    sample_post: `Sample post for ${name} (mock mode).`,
  };
}
