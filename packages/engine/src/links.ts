// Own short links with UTM tagging, so every channel's clicks and signups can be told apart.
import { randomBytes } from 'node:crypto';
import type { Db } from './db.ts';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/l/I)
export function shortCode(len = 7) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Adds utm_* and our ref, keeping anything the site already has (a site's own UTM tags win). */
export function withTracking(target: string, t: { source: string; medium?: string; campaign?: string | null; code?: string }) {
  const u = new URL(target);
  if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', t.source);
  if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', t.medium ?? 'social');
  if (t.campaign && !u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', t.campaign);
  if (t.code) u.searchParams.set('sil', t.code);
  return u.toString();
}

/** Finds links to the product's own site in a post: with or without https:// or www, trailing punctuation left alone. */
function productLinkRe(productUrl: string | null): RegExp | null {
  if (!productUrl) return null;
  let host: string;
  try { host = new URL(productUrl).hostname.replace(/^www\./, ''); } catch { return null; }
  const esc = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Whole domain only: not inside another domain ("otherbalans.ng", "balans.nginx.io").
  return new RegExp(`(?<![\\w.-])(?:https?:\\/\\/)?(?:www\\.)?${esc}(?![\\w-]|\\.[a-z])(?:\\/[^\\s)\\]>"']*)?`, 'gi');
}

export function findProductLinks(text: string, productUrl: string | null): string[] {
  const re = productLinkRe(productUrl);
  if (!re) return [];
  return [...new Set((text.match(re) ?? []).map((m) => m.replace(/[.,!?;:]+$/, '')))];
}

export async function createShortLink(db: Db, workspaceId: string, l: { target: string; source: string; medium?: string; campaign?: string | null; assetId?: string | null }) {
  if (l.assetId) {
    const { data } = await db.from('short_links').select('code').eq('asset_id', l.assetId).eq('target_url', l.target).maybeSingle();
    if (data) return data.code as string;
  }
  for (let i = 0; i < 5; i++) {
    const code = shortCode();
    const { error } = await db.from('short_links').insert({ workspace_id: workspaceId, code, target_url: l.target, source: l.source, medium: l.medium ?? 'social', campaign: l.campaign ?? null, asset_id: l.assetId ?? null });
    if (!error) return code;
    if (error.code !== '23505') throw new Error(`short link: ${error.message}`);
  }
  throw new Error('Could not create a short link');
}

/**
 * Swaps links to the product in a post for tracked short links, so clicks and signups are credited to this channel.
 * Returns the new text (unchanged when there's nothing to swap or no public base URL).
 */
export async function trackLinksInText(db: Db, workspaceId: string, text: string, o: { productUrl: string | null; base: string | null; source: string; campaign?: string | null; assetId?: string | null }) {
  const re = productLinkRe(o.productUrl);
  if (!o.base || !re) return text;
  const codes = new Map<string, string>();
  for (const found of findProductLinks(text, o.productUrl)) {
    const target = /^https?:\/\//i.test(found) ? found : `https://${found}`;
    codes.set(found, await createShortLink(db, workspaceId, { target, source: o.source, campaign: o.campaign, assetId: o.assetId }));
  }
  // Replace using the same whole-domain match, keeping trailing punctuation outside the link.
  return text.replace(re, (m) => {
    const clean = m.replace(/[.,!?;:]+$/, '');
    const code = codes.get(clean);
    return code ? `${o.base!.replace(/\/$/, '')}/l/${code}${m.slice(clean.length)}` : m;
  });
}

/** Communities that remove posts with URL shorteners (Reddit bans them outright). There we tag the real URL instead. */
export const NO_SHORTENER = new Set(['reddit', 'hn', 'github', 'indiehackers', 'rss', 'producthunt']);

/** Adds UTM tags to the product's own links in place, keeping the real address visible (no shortener). */
export function tagLinksInText(text: string, productUrl: string | null, t: { source: string; medium?: string; campaign?: string | null }) {
  const re = productLinkRe(productUrl);
  if (!re) return text;
  return text.replace(re, (m) => {
    const clean = m.replace(/[.,!?;:]+$/, '');
    try { return withTracking(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`, t) + m.slice(clean.length); } catch { return m; }
  });
}

const BOTS =/bot|crawler|spider|preview|facebookexternalhit|slack|whatsapp|telegram|discord|embedly|vkshare|skypeuripreview|curl|wget|python-requests|headless/i;
/** Link previews (X, LinkedIn, WhatsApp, Slack...) fetch links too; they aren't people and shouldn't count. */
export const isBot = (ua: string | null) => !ua || BOTS.test(ua);
