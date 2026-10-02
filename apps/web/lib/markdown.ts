import { Marked, type Tokens } from 'marked';

// Article Markdown → safe HTML. Raw HTML in the source is shown as text, never run; links to other sites
// get nofollow; headings get ids for the table of contents.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ');
const idOf = (s: string) => plain(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';

export interface Heading { id: string; text: string; level: number }

export function renderMarkdown(md: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, { tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        let id = idOf(inner);
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n) id = `${id}-${n + 1}`;
        const level = Math.min(Math.max(depth, 2), 4); // the page title is the only h1
        if (level <= 3) headings.push({ id, text: plain(inner), level });
        return `<h${level} id="${id}">${inner}</h${level}>\n`;
      },
      link(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, { href, title, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens);
        if (!/^(https?:\/\/|\/|#|mailto:)/i.test(href)) return text; // drop javascript: and friends
        const external = /^https?:\/\//i.test(href);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' rel="nofollow noopener" target="_blank"' : ''}>${text}</a>`;
      },
      image({ href, text }: Tokens.Image) {
        return /^https:\/\//i.test(href) ? `<img src="${esc(href)}" alt="${esc(text)}" loading="lazy" />` : esc(text);
      },
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return esc(text);
      },
    },
  });
  const html = marked.parse(md, { async: false }) as string;
  return { html, headings };
}

/** Rough reading time at 230 words a minute. */
export const readingMinutes = (md: string) => Math.max(1, Math.round((md.match(/\b[\w']+\b/g) ?? []).length / 230));
