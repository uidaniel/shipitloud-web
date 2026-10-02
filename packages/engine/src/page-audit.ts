// Landing page audit (PRD section 5 "Landing page audit", section 6 "Conversion fixes"): what a visitor sees first,
// what it asks them to do, and what makes them believe it. Read from the HTML here; the AI only picks the top
// fix per area, and has to quote the page when it says what's wrong.

export type AuditArea = 'clarity' | 'cta' | 'trust';
export interface AuditHint { area: AuditArea; issue: string }
export interface PageFacts {
  title: string;
  description: string;
  h1: string[];
  headings: string[];          // h2/h3 in order
  ctas: string[];              // button and link labels that ask for an action, in order
  forms: number;               // forms with an email field
  trust: { testimonials: boolean; logos: boolean; numbers: boolean; pricing: boolean; privacy: boolean; refund: boolean; security: boolean; contact: boolean; reviews: boolean; founder: boolean };
  text: string;                // visible text, trimmed for the model
  words: number;
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, '\'').replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;|&ndash;/g, '-')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
// Inline tags join without a space: animated headlines often wrap every letter in its own <span>.
const INLINE = /<\/?(span|em|strong|b|i|u|mark|sup|sub|small)\b[^>]*>/gi;
const clean = (s: string) => decode(s.replace(INLINE, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/([a-z][.!?])([A-Z])/g, '$1 $2').trim();
const strip = (html: string) => html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

const ACTION = /^(get|start|try|sign ?up|join|book|request|download|buy|subscribe|claim|create|build|launch|see|watch|grab|reserve|apply|contact|talk|schedule|install|add to|upgrade|explore|let'?s)\b/i;
const NAV = /^(log ?in|sign ?in|home|blog|docs|about|pricing|features|faq|careers|terms|privacy|menu|close|skip|contact( us)?$)/i;

export function extractPage(rawHtml: string): PageFacts {
  const html = strip(rawHtml);
  const all = (re: RegExp) => [...html.matchAll(re)].map((m) => clean(m[1] ?? '')).filter(Boolean);
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const metaTag = (html.match(/<meta[^>]+>/gi) ?? []).find((t) => /name\s*=\s*["'](description|og:description)["']|property\s*=\s*["']og:description["']/i.test(t));
  const description = decode(metaTag?.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').trim();
  const h1 = all(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  const headings = all(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi).slice(0, 20);

  const ctas: string[] = [];
  for (const m of html.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const label = clean(m[3] ?? '');
    const attrs = m[2] ?? '';
    if (!label || label.length > 40 || NAV.test(label)) continue;
    const looksLikeButton = m[1]!.toLowerCase() === 'button' ? !/type\s*=\s*["']button["']/i.test(attrs) || ACTION.test(label) : /class\s*=\s*["'][^"']*(btn|button|cta)/i.test(attrs);
    if ((looksLikeButton || ACTION.test(label)) && !ctas.includes(label)) ctas.push(label);
  }
  for (const m of html.matchAll(/<input[^>]+type\s*=\s*["']submit["'][^>]*>/gi)) {
    const v = decode(m[0].match(/value\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').trim();
    if (v && !ctas.includes(v)) ctas.push(v);
  }
  const forms = (html.match(/<form[\s\S]*?<\/form>/gi) ?? []).filter((f) => /type\s*=\s*["']email["']|name\s*=\s*["'][^"']*email/i.test(f)).length
    || (/type\s*=\s*["']email["']/i.test(html) ? 1 : 0);

  const text = html.replace(INLINE, '').replace(/<\/(p|div|h[1-6]|li|section|header|footer|br|tr|button|a)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const lines = decode(text).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1).filter((l, i, a) => a.indexOf(l) === i);
  const body = lines.join('\n');
  const low = body.toLowerCase();
  const hrefs = (html.match(/href\s*=\s*["']([^"']+)["']/gi) ?? []).join(' ').toLowerCase();
  const trust = {
    testimonials: /<blockquote/i.test(html) || /testimonial|what (our )?(customers|users|people) (say|are saying)|loved by/i.test(low),
    logos: /trusted by|used by (teams|companies|founders)|as seen (on|in)|featured (on|in)|our customers/i.test(low),
    numbers: /\b\d[\d,.]*\s?(k|m)?\+?\s+(happy |active |paying )?(users|customers|teams|founders|businesses|companies|creators|people|downloads|signups|freelancers|developers|makers|agencies|stores|merchants|students|members|clients)\b/i.test(low)
      || /(used by|trusted by|loved by|joined by|join) (over |more than )?\d[\d,.]*/i.test(low),
    pricing: /pricing|\/plans/.test(hrefs) || /\$\d|₦\d|€\d|£\d|per month|\/mo\b|free plan|free forever/i.test(low),
    privacy: /privacy/.test(hrefs) || /privacy policy/i.test(low),
    refund: /refund|money.back|guarantee|cancel any ?time/i.test(low),
    security: /encrypt|gdpr|soc ?2|secure (payments|checkout)|bank-level|iso 27001/i.test(low),
    contact: /mailto:|\/contact|wa\.me\//.test(hrefs) || /contact us|get in touch/i.test(low),
    reviews: /producthunt\.com|g2\.com|trustpilot|capterra|app ?store rating|★/i.test(`${hrefs} ${low}`),
    founder: /founder|built by|made by|hi, i'?m|our story|about us/i.test(low),
  };
  return { title, description, h1, headings, ctas: ctas.slice(0, 12), forms, trust, text: body.slice(0, 3000), words: body.split(/\s+/).filter(Boolean).length };
}

const VAGUE = /\b(revolutioni[sz]e|next[- ]gen(eration)?|unleash|supercharge|seamless(ly)?|all-in-one|cutting[- ]edge|game[- ]chang(er|ing)|empower|synergy|leverage|innovative|world[- ]class|best[- ]in[- ]class|reimagin(e|ed))\b/i;
const WEAK_CTA = /^(submit|send|click here|learn more|go|continue|ok)$/i;

/** Problems we can see without an opinion. They guide the AI and show under the top fixes. */
export function auditHints(p: PageFacts): AuditHint[] {
  const h: AuditHint[] = [];
  const headline = p.h1[0] ?? '';
  if (!p.h1.length) h.push({ area: 'clarity', issue: 'There is no main headline (h1), so it is not obvious what the page is about.' });
  else if (p.h1.length > 1) h.push({ area: 'clarity', issue: `There are ${p.h1.length} main headlines (h1). One clear headline works better.` });
  if (headline && headline.split(/\s+/).length > 14) h.push({ area: 'clarity', issue: `The headline is long (${headline.split(/\s+/).length} words). Visitors decide in a few seconds.` });
  const vague = `${headline} ${p.description}`.match(VAGUE)?.[0];
  if (vague) h.push({ area: 'clarity', issue: `"${vague}" says little about what the product actually does.` });
  if (!p.description) h.push({ area: 'clarity', issue: 'No meta description, so search results and shared links show random text.' });
  if (p.words < 60) h.push({ area: 'clarity', issue: 'The page has very little text, so visitors (and search engines) can’t tell what it does.' });

  if (!p.ctas.length && !p.forms) h.push({ area: 'cta', issue: 'There is no clear button or signup form asking visitors to do something.' });
  const weak = p.ctas.find((c) => WEAK_CTA.test(c));
  if (weak) h.push({ area: 'cta', issue: `The button "${weak}" doesn’t say what happens when you click it.` });
  const distinct = new Set(p.ctas.map((c) => c.toLowerCase()));
  if (distinct.size >= 6) h.push({ area: 'cta', issue: `There are ${distinct.size} different calls to action, which splits attention. Pick one main action.` });
  if (!p.forms && p.ctas.length) h.push({ area: 'cta', issue: 'There is no email form, so visitors who aren’t ready yet have no way to stay in touch.' });

  const t = p.trust;
  if (!t.testimonials && !t.logos && !t.numbers && !t.reviews) h.push({ area: 'trust', issue: 'No social proof: no quotes from users, logos, user counts or reviews.' });
  if (!t.privacy) h.push({ area: 'trust', issue: 'No link to a privacy policy, which people look for before giving an email.' });
  if (!t.pricing) h.push({ area: 'trust', issue: 'No pricing on the page or linked, so visitors can’t tell what it will cost.' });
  if (!t.founder && !t.contact) h.push({ area: 'trust', issue: 'Nothing says who is behind the product or how to reach them.' });
  return h;
}

/** True when `quote` appears on the page (ignoring case, spacing and quote marks). */
export function onPage(quote: string, p: PageFacts): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[“”"‘’'`]/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const q = norm(quote);
  if (q.length < 3) return false;
  return norm([p.title, p.description, ...p.h1, ...p.headings, ...p.ctas, p.text].join('\n')).includes(q);
}

/** A rewrite must be the new words themselves. "Add an email field with…" is advice, not copy, so it's dropped. */
export function isInstruction(text: string): boolean {
  const t = text.trim();
  return t.split(/\s+/).length > 6 && /^(add|remove|replace|change|use|put|move|make|include|keep|show|consider|try|swap|rewrite|create|place|delete|cut)\b/i.test(t);
}

/** Long quotes are shortened at a word, so a card shows the part that matters. */
export function shortQuote(q: string, max = 160): string {
  const t = q.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,.;:]+$/, '')}…`;
}
