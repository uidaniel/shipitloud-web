// SEO check for a blog article: deterministic, with a fix for every point lost.

export interface ArticleInput { keyword: string; title: string; slug: string; metaTitle: string; metaDescription: string; body: string; faq: { q: string; a: string }[]; competitors?: string[] }
export interface SeoResult { score: number; tips: string[]; words: number; verify: string[]; claims: { competitor: string; sentence: string }[] }

const GLUE = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'my', 'your', 'with', 'is', 'vs', 'how']);
const tokens = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !GLUE.has(w)).map((w) => w.replace(/(ies)$/, 'y').replace(/s$/, ''));
/** True when every meaningful word of the keyword appears in the text (plural-insensitive). */
export const hasKeyword = (text: string, keyword: string) => { const t = new Set(tokens(text)); const k = tokens(keyword); return k.length > 0 && k.every((w) => t.has(w)); };

export function slugify(s: string, max = 60) {
  const base = s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (base.length <= max) return base || 'post';
  return base.slice(0, max).replace(/-[^-]*$/, '') || base.slice(0, max);
}

const FACT_WORDS = /\b(is|are|isn'?t|aren'?t|has|have|offers?|requires?|charges?|costs?|supports?|lets|sends|pays|works|doesn'?t|don'?t|can'?t|cannot|won'?t|only|free|price|pricing|fee|fees|plan|plans|limit|usd|paypal|currency|currencies|offline|features?)\b/i;

/** Sentences that state something about a named competitor. In comparisons these are where errors hurt most, so each one gets checked. */
export function competitorStatements(markdown: string, competitors: string[]): { competitor: string; sentence: string }[] {
  const names = competitors.map((c) => c.trim()).filter(Boolean);
  if (!names.length) return [];
  const text = markdown.replace(/^#+\s.*$/gm, ' ').replace(/[*_`>]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/^[-\d.)\s]+/, '').trim()).filter((s) => s.length > 20);
  const out: { competitor: string; sentence: string }[] = [];
  for (const s of sentences) {
    const c = names.find((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s));
    if (c && FACT_WORDS.test(s) && !/\[verify/i.test(s)) out.push({ competitor: c, sentence: s.slice(0, 300) });
  }
  return out;
}

export function seoScore(a: ArticleInput): SeoResult {
  const tips: string[] = [];
  let score = 100;
  const lose = (n: number, tip: string) => { score -= n; tips.push(tip); };
  const plain = a.body.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`[\]()!-]/g, ' ');
  const words = (plain.match(/\b[\w']+\b/g) ?? []).length;
  const h2 = (a.body.match(/^##\s+.+$/gm) ?? []);
  const opening = plain.split(/\s+/).slice(0, 120).join(' ');
  const verify = [...a.body.matchAll(/\[verify:?\s*([^\]]{3,200})\]/gi)].map((m) => m[1]!.trim());

  if (!hasKeyword(a.title, a.keyword)) lose(15, `Put “${a.keyword}” in the title.`);
  if (!hasKeyword(a.metaTitle, a.keyword)) lose(5, 'Put the keyword in the search title.');
  if (a.metaTitle.length > 60) lose(5, `The search title is ${a.metaTitle.length} characters; Google shows about 60.`);
  if (a.metaDescription.length < 110 || a.metaDescription.length > 160) lose(5, `Make the search description 110 to 160 characters (now ${a.metaDescription.length}).`);
  if (!hasKeyword(a.metaDescription, a.keyword)) lose(3, 'Mention the keyword in the search description.');
  if (!hasKeyword(opening, a.keyword)) lose(10, 'Answer the search in the first two sentences, using the keyword.');
  if (!h2.some((h) => hasKeyword(h, a.keyword)) && h2.length) lose(3, 'Use the keyword in at least one section heading.');
  if (h2.length < 3) lose(10, 'Add more sections (at least three ## headings) so it is easy to scan.');
  if (words < 800) lose(15, `It is short (${words} words). Aim for 1,000 or more for this kind of search.`);
  else if (words > 3000) lose(5, `It is long (${words} words). Trim anything that doesn't help the reader.`);
  if (a.faq.length < 3) lose(5, 'Add at least three FAQs; they can show up directly in search results.');
  if (!hasKeyword(a.slug.replace(/-/g, ' '), a.keyword)) lose(3, 'Put the keyword in the address (slug).');
  if (a.body.split(/\n\s*\n/).some((p) => !p.trim().startsWith('|') && p.length > 700)) lose(5, 'Break up long paragraphs.');
  if (verify.length) lose(Math.min(20, verify.length * 5), `Check ${verify.length} fact${verify.length === 1 ? '' : 's'} marked [verify] before publishing.`);
  const claims = competitorStatements([a.body, ...a.faq.map((f) => f.a)].join('\n'), a.competitors ?? []);
  if (claims.length) lose(Math.min(25, claims.length * 3), `Check ${claims.length} statement${claims.length === 1 ? '' : 's'} about other products. Wrong facts about competitors can get you in trouble.`);
  return { score: Math.max(0, Math.min(100, score)), tips, words, verify, claims };
}
