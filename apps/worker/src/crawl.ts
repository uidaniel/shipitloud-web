// Reads a product site cheaply: the homepage plus up to 3 key pages (pricing, about, features).
// Plain fetch, no browser, hard size and time limits; text is trimmed so the AI call stays small.
export interface Page { url: string; title: string; text: string }
export interface SiteFacts {
  pages: Page[];
  meta: { description?: string; ogImage?: string; themeColor?: string; icons: string[]; siteName?: string };
  fontFamilies: string[];
}

const MAX_BYTES = 600_000;
const PAGE_CHARS = 3_500;     // per page sent to the model (~1k tokens)
const KEY_PATHS = /\/(pricing|about|features|product|how-it-works|faq)\/?$/i;

async function fetchText(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: { 'User-Agent': 'ShipItLoudBot/1.0 (+https://shipitloud.com)', Accept: 'text/html' },
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
    const buf = await res.arrayBuffer();
    return { html: new TextDecoder().decode(buf.slice(0, MAX_BYTES)), finalUrl: res.url };
  } catch {
    return null;
  }
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
}

function metaContent(html: string, key: string) {
  for (const tag of html.match(/<meta[^>]+>/gi) ?? []) {
    if ((attr(tag, 'name') ?? attr(tag, 'property'))?.toLowerCase() === key) return attr(tag, 'content');
  }
  return undefined;
}

export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|h[1-6]|li|section|article|header|footer|br|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1)
    .filter((l, i, arr) => arr.indexOf(l) === i) // drop repeated nav/footer lines
    .join('\n');
}

export async function crawlSite(start: string): Promise<SiteFacts> {
  const home = await fetchText(start);
  if (!home) throw new Error(`Couldn't open ${start}. Check the link, or describe the product instead.`);
  const base = new URL(home.finalUrl);
  const html = home.html;

  const icons = (html.match(/<link[^>]+>/gi) ?? [])
    .filter((t) => /rel\s*=\s*["'][^"']*(icon|apple-touch-icon)[^"']*["']/i.test(t))
    .map((t) => attr(t, 'href')).filter((h): h is string => !!h)
    .map((h) => new URL(h, base).toString());

  const links = [...new Set((html.match(/<a[^>]+href\s*=\s*["']([^"'#]+)["']/gi) ?? [])
    .map((t) => attr(t, 'href')).filter((h): h is string => !!h)
    .map((h) => { try { return new URL(h, base); } catch { return null; } })
    .filter((u): u is URL => !!u && u.hostname === base.hostname && KEY_PATHS.test(u.pathname))
    .map((u) => u.origin + u.pathname))].slice(0, 3);

  const pages: Page[] = [{ url: base.toString(), title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''), text: htmlToText(html).slice(0, PAGE_CHARS) }];
  for (const link of links) {
    const p = await fetchText(link);
    if (p) pages.push({ url: link, title: decode(p.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''), text: htmlToText(p.html).slice(0, PAGE_CHARS) });
  }

  const fontFamilies = [...new Set([...(html.matchAll(/font-family\s*:\s*([^;}"]+)/gi))]
    .map((m) => m[1]!.split(',')[0]!.replace(/["']/g, '').trim())
    .filter((f) => f && !/^(inherit|initial|sans-serif|serif|monospace|system-ui|var\()/i.test(f)))].slice(0, 4);
  // Google Fonts links name the families directly.
  for (const t of html.match(/<link[^>]+fonts\.googleapis\.com[^>]+>/gi) ?? []) {
    for (const fam of (attr(t, 'href') ?? '').matchAll(/family=([^:&]+)/g)) fontFamilies.push(decodeURIComponent(fam[1]!.replace(/\+/g, ' ')));
  }

  const og = metaContent(html, 'og:image');
  return {
    pages,
    meta: {
      description: metaContent(html, 'description') ?? metaContent(html, 'og:description'),
      ogImage: og ? new URL(og, base).toString() : undefined,
      themeColor: metaContent(html, 'theme-color'),
      icons,
      siteName: metaContent(html, 'og:site_name'),
    },
    fontFamilies: [...new Set(fontFamilies)].slice(0, 4),
  };
}
