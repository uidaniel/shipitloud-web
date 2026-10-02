// SEO blog engine (PRD section 6): keyword ideas from the brand and listening, then articles the founder approves.
import { z } from 'zod';
import { brandBlock, type BrandContext } from './launch.ts';

export const BLOG_KEYWORDS_VERSION = 'blog_keywords@1';
export const BLOG_ARTICLE_VERSION = 'blog_article@2';

export const KIND = ['best', 'alternative', 'versus', 'howto', 'usecase', 'question'] as const;

export const KeywordsSchema = z.object({
  ideas: z.array(z.object({
    keyword: z.string().describe('What a person would type into Google, lowercase, 2-8 words'),
    kind: z.enum(KIND),
    why: z.string().describe('Under 15 words: who searches this and why the product fits'),
    priority: z.number().int().describe('0-100: likely buyer intent for this product, higher first'),
  })).describe('12-15 ideas'),
});
export type KeywordIdeas = z.infer<typeof KeywordsSchema>;

export const BLOG_KEYWORDS_SYSTEM = `You find blog topics that bring the right people to a small product from search.

Pick searches with clear intent that a small site can rank for:
- "best [category] for [audience]" lists, "[competitor] alternative", "[competitor] vs [product]"
- how-to searches for the exact problem the product solves
- use-case searches ("[category] for [specific audience or situation]")
- questions people actually ask (use the listening questions given)
Prefer specific long-tail searches over broad ones. No brand names except the competitors given. No duplicates of the existing keywords.`;

export function keywordsPrompt(b: BrandContext, questions: string[], existing: string[]) {
  return `${brandBlock(b)}

Questions people asked recently:
${questions.length ? questions.map((q) => `- ${q}`).join('\n') : 'none'}

Already have (don't repeat): ${existing.join('; ') || 'none'}

Suggest keyword ideas.`;
}

export function mockKeywords(b: BrandContext): KeywordIdeas {
  const c = b.competitors[0] ?? 'spreadsheets';
  return { ideas: [
    { keyword: `best ${b.keywords[0] ?? 'tool'} for small teams`, kind: 'best', why: 'Comparing options before buying (sample)', priority: 80 },
    { keyword: `${c} alternative`, kind: 'alternative', why: 'Unhappy with a competitor (sample)', priority: 75 },
    { keyword: `how to ${(b.pain_points[0] ?? 'save time').toLowerCase()}`, kind: 'howto', why: 'Has the exact problem (sample)', priority: 60 },
  ] };
}

export const ArticleSchema = z.object({
  title: z.string().describe('H1 title with the keyword, under 70 characters'),
  slug: z.string().describe('lowercase-words-with-dashes, includes the keyword, under 60 characters'),
  meta_title: z.string().describe('Search result title with the keyword, under 60 characters'),
  meta_description: z.string().describe('Search result description, 120-155 characters, includes the keyword, says what the reader gets'),
  excerpt: z.string().describe('One or two sentences for the blog index'),
  body_markdown: z.string().describe('The article in Markdown, 1100-1700 words. Start with the answer. Use ## and ### headings, short paragraphs, lists. No H1, no FAQ section.'),
  faq: z.array(z.object({ q: z.string(), a: z.string().describe('2-3 sentences') })).describe('3-5 questions people also ask'),
});
export type Article = z.infer<typeof ArticleSchema>;

export const BLOG_ARTICLE_SYSTEM = `You write a genuinely useful blog article for a small product's website, aimed at one search.

Rules:
- The first sentence contains the exact search phrase and answers it. Then go deeper: steps, examples, what to look for, mistakes to avoid. Aim for 6-8 ## sections of 150-250 words each, so the article is 1,200-1,700 words.
- Write for the target customer in plain words. Short paragraphs, descriptive ## headings, lists where they help. Sound like the founder, clearer.
- The product appears where it honestly fits, described only with facts from the brand block. One clear call to try it near the end. No hype.
- Other products: compare on approach and fit only ("a full accounting suite" vs "invoicing inside WhatsApp"; "suits people who need X"). Do not state their prices, fees, free tiers, payment methods, currencies, payout behaviour, offline support, requirements, limits or features. If the reader truly needs a specific fact about another product, write [verify: the fact] instead of stating it.
- The product: use only the facts given. Never mention its pricing, free trials, plans or guarantees unless they are in the facts.
- Never invent statistics, studies, quotes, customers, case studies or results. No "studies show", no made-up percentages.
- In "best" and "alternative" articles, include the product as one option among real alternatives, and be fair about when another option suits someone better.
- If existing articles are listed, link to up to three of them where genuinely relevant, using Markdown links exactly as given.
- No em dashes, no emoji, no buzzwords (game-changer, revolutionize, unlock, leverage, seamless, delve).`;

export function articlePrompt(b: BrandContext, k: { keyword: string; kind: string; why: string | null }, existing: { title: string; url: string }[], facts = '') {
  return `${brandBlock(b)}
${facts ? `Facts about the product (the only things you may say about it): ${facts}\n` : ''}
Search to target: "${k.keyword}" (${k.kind}${k.why ? `: ${k.why}` : ''})

Existing articles you may link to:
${existing.length ? existing.map((e) => `- [${e.title}](${e.url})`).join('\n') : 'none yet'}

Write the article.`;
}

export function mockArticle(b: BrandContext, keyword: string): Article {
  const para = `This is sample text (mock mode) about ${keyword}. It explains the problem plainly and what to do about it, step by step, for ${b.target_customer ?? 'the reader'}.`;
  const sec = (h: string) => `## ${h}\n\n${Array.from({ length: 6 }, () => para).join('\n\n')}`;
  return {
    title: `${keyword[0]!.toUpperCase()}${keyword.slice(1)}: a practical guide`,
    slug: keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55),
    meta_title: `${keyword} (practical guide)`.slice(0, 60),
    meta_description: `A practical guide to ${keyword}: what to look for, steps that work, and mistakes to avoid. Written for ${b.target_customer ?? 'small teams'}.`.slice(0, 155),
    excerpt: `A practical guide to ${keyword} (sample).`,
    body_markdown: `${keyword[0]!.toUpperCase()}${keyword.slice(1)} comes down to a few simple habits. ${para}\n\n${sec(`What to know about ${keyword}`)}\n\n${sec('Steps that work')}\n\n${sec('Mistakes to avoid')}\n\n${sec(`Where ${b.name} fits`)}`,
    faq: [{ q: `What is ${keyword}?`, a: 'Sample answer.' }, { q: 'How long does it take?', a: 'Sample answer.' }, { q: 'Is it free?', a: 'Sample answer.' }],
  };
}
