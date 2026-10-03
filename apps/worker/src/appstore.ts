// App listings (PRD v6, section 23 "App links"). Apple: the public iTunes Lookup and Search APIs, reviews from the
// public review feed (or the app's public page when the feed is empty). Google Play has no public listing API: we read
// only the public listing page's basic metadata (name, description, icon, rating) and no reviews until a licensed data
// provider is chosen (docs/setup-checklist.md).
import { parseStoreUrl, storeUrl, type StoreRef } from '@shipitloud/engine';
import type { SiteFacts } from './crawl.ts';

export interface Listing {
  store: 'apple' | 'google'; id: string; url: string; name: string; description: string; category: string | null; price: string | null;
  icon: string | null; screenshots: string[]; rating: number | null; ratings: number | null; seller: string | null; website: string | null;
  reviews: { rating: number | null; title: string; text: string }[]; similar: { name: string; rating: number | null }[];
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; ShipItLoudBot/1.0; +https://shipitloud.netlify.app)', 'Accept-Language': 'en' };
async function get(url: string, json = true) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return json ? res.json() : res.text();
}
const unescape = (s: string) => { try { return JSON.parse(`"${s}"`) as string; } catch { return s; } };

async function appleReviews(r: StoreRef): Promise<Listing['reviews']> {
  try {
    const feed = (await get(`https://itunes.apple.com/${r.country}/rss/customerreviews/page=1/id=${r.id}/sortby=mostrecent/json`)) as { feed?: { entry?: unknown } };
    const entries = ([] as { 'im:rating'?: { label: string }; title?: { label: string }; content?: { label: string } }[]).concat((feed.feed?.entry as never) ?? []);
    const out = entries.filter((e) => e.content?.label).map((e) => ({ rating: Number(e['im:rating']?.label) || null, title: e.title?.label ?? '', text: e.content!.label }));
    if (out.length) return out.slice(0, 30);
  } catch { /* fall through to the public page */ }
  try {
    const html = (await get(storeUrl(r), false)) as string;
    const out: Listing['reviews'] = [];
    for (const m of html.matchAll(/"\$kind":"Review","id":"\d+","title":"((?:[^"\\]|\\.)*)","contents":"((?:[^"\\]|\\.)*)"(?:,"rating":(\d))?/g)) {
      out.push({ title: unescape(m[1]!), text: unescape(m[2]!), rating: m[3] ? Number(m[3]) : null });
    }
    return [...new Map(out.map((x) => [x.text, x])).values()].slice(0, 30);
  } catch { return []; }
}

async function apple(r: StoreRef): Promise<Listing> {
  const d = (await get(`https://itunes.apple.com/lookup?id=${r.id}&country=${r.country}`)) as { results: Record<string, unknown>[] };
  const a = d.results?.find((x) => x.kind === 'software' || x.wrapperType === 'software');
  if (!a) throw new Error('We couldn’t find that app on the App Store. Check the link.');
  const genre = String(a.primaryGenreName ?? '');
  const [reviews, similar] = await Promise.all([
    appleReviews(r),
    get(`https://itunes.apple.com/search?term=${encodeURIComponent(String(a.trackName).split(/[:\-–—]/)[1]?.trim() || genre || String(a.trackName))}&entity=software&country=${r.country}&limit=8`)
      .then((s) => ((s as { results: Record<string, unknown>[] }).results ?? []).filter((x) => String(x.trackId) !== r.id).slice(0, 5).map((x) => ({ name: String(x.trackName), rating: Number(x.averageUserRating) || null })))
      .catch(() => []),
  ]);
  return {
    store: 'apple', id: r.id, url: String(a.trackViewUrl ?? storeUrl(r)).replace(/\?uo=\d+$/, ''), name: String(a.trackName), description: String(a.description ?? ''),
    category: genre || null, price: String(a.formattedPrice ?? '') || null, icon: (a.artworkUrl512 as string) ?? null,
    screenshots: ((a.screenshotUrls as string[]) ?? []).slice(0, 6), rating: Number(a.averageUserRating) || null, ratings: Number(a.userRatingCount) || null,
    seller: (a.sellerName as string) ?? null, website: (a.sellerUrl as string) ?? null, reviews, similar,
  };
}

async function google(r: StoreRef): Promise<Listing> {
  const html = (await get(`${storeUrl(r)}&hl=en&gl=${r.country}`, false)) as string;
  const meta = (k: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)="${k}"[^>]+content="([^"]*)"`, 'i'))?.[1] ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${k}"`, 'i'))?.[1];
  const title = (meta('og:title') ?? '').replace(/ - Apps on Google Play$/, '').trim();
  if (!title) throw new Error('We couldn’t read that Google Play listing. Check the link.');
  const rating = Number(html.match(/"ratingValue":"?([\d.]+)/)?.[1]) || null;
  const ratings = Number(html.match(/"ratingCount":"?(\d+)/)?.[1]) || null;
  const category = html.match(/"applicationCategory":"([^"]+)"/)?.[1]?.replace(/_/g, ' ').toLowerCase() ?? null;
  return {
    store: 'google', id: r.id, url: storeUrl(r), name: title, description: (meta('og:description') ?? meta('description') ?? '').trim(), category,
    price: /"price":"0"/.test(html) ? 'Free' : null, icon: meta('og:image') ?? null, screenshots: [], rating, ratings, seller: null, website: null, reviews: [], similar: [],
  };
}

/** Read a store listing from its link, or null if it isn't a store link. */
export async function readListing(url: string): Promise<Listing | null> {
  const r = parseStoreUrl(url);
  if (!r) return null;
  return r.store === 'apple' ? apple(r) : google(r);
}

/** The listing as "site facts", so the rest of setup reads it like a website (reviews in their own words included). */
export function listingAsSite(l: Listing): SiteFacts {
  const loves = l.reviews.filter((x) => (x.rating ?? 5) >= 4).slice(0, 8);
  const hates = l.reviews.filter((x) => (x.rating ?? 5) <= 2).slice(0, 8);
  const text = [
    `${l.name}${l.category ? ` · ${l.category}` : ''}${l.price ? ` · ${l.price}` : ''}${l.rating ? ` · rated ${l.rating.toFixed(1)} from ${l.ratings ?? 0} ratings` : ''}`,
    l.description.slice(0, 2500),
    loves.length ? `What users love (reviews):\n${loves.map((x) => `- ${x.title}: ${x.text.slice(0, 240)}`).join('\n')}` : '',
    hates.length ? `What users complain about (reviews):\n${hates.map((x) => `- ${x.title}: ${x.text.slice(0, 240)}`).join('\n')}` : '',
    l.similar.length ? `Similar apps: ${l.similar.map((x) => x.name).join(', ')}` : '',
  ].filter(Boolean).join('\n\n');
  const esc = (s: string) => s.replace(/[<>&"]/g, '');
  return {
    pages: [{ url: l.url, title: l.name, text }],
    html: `<title>${esc(l.name)}</title><meta name="description" content="${esc(l.description.slice(0, 200))}"><h1>${esc(l.name)}</h1><p>${esc(l.description.slice(0, 1500))}</p><a href="${l.url}">store</a>`,
    meta: { description: l.description.slice(0, 200), ogImage: l.screenshots[0], icons: l.icon ? [l.icon] : [], siteName: l.name },
    fontFamilies: [],
  };
}
