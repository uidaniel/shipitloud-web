// App Store and Google Play links (PRD v6, section 23): recognise them, tag store links so installs can be credited
// to a channel, and decide when a listing is too thin to work from without asking the founder 3 quick questions.

export interface StoreRef { store: 'apple' | 'google'; id: string; country: string }

/** apps.apple.com/us/app/name/id123 → apple 123; play.google.com/store/apps/details?id=com.x → google com.x */
export function parseStoreUrl(input: string): StoreRef | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'apps.apple.com' || host === 'itunes.apple.com') {
    const id = u.pathname.match(/\/id(\d{5,12})/)?.[1];
    const country = u.pathname.match(/^\/([a-z]{2})\//)?.[1] ?? 'us';
    return id ? { store: 'apple', id, country } : null;
  }
  if (host === 'play.google.com' && u.pathname.startsWith('/store/apps/details')) {
    const id = u.searchParams.get('id');
    return id && /^[\w.]{3,150}$/.test(id) ? { store: 'google', id, country: (u.searchParams.get('gl') ?? 'us').toLowerCase() } : null;
  }
  return null;
}

export const isStoreUrl = (url: string | null | undefined) => !!url && !!parseStoreUrl(url);
export const storeUrl = (r: StoreRef) => (r.store === 'apple' ? `https://apps.apple.com/${r.country}/app/id${r.id}` : `https://play.google.com/store/apps/details?id=${r.id}`);

/**
 * A store link that credits installs to a channel. Apple: campaign token `ct` (and `pt` when the founder has an
 * App Store Connect provider token). Google Play: the install `referrer` carries UTM parameters.
 */
export function storeLinkWithCampaign(url: string, t: { source: string; campaign?: string | null; providerToken?: string | null }) {
  const ref = parseStoreUrl(url);
  if (!ref) return url;
  const u = new URL(storeUrl(ref));
  if (ref.store === 'apple') {
    u.searchParams.set('ct', `${t.source}${t.campaign ? `-${t.campaign}` : ''}`.slice(0, 40));
    if (t.providerToken) u.searchParams.set('pt', t.providerToken);
  } else {
    u.searchParams.set('referrer', new URLSearchParams({ utm_source: t.source, utm_medium: 'social', ...(t.campaign ? { utm_campaign: t.campaign } : {}) }).toString());
  }
  return u.toString();
}

/** Ask the 3 quick questions for every app link, and for websites or listings that say too little to work from. */
export function needsQuestions(o: { isApp: boolean; words: number; ratings?: number | null }): boolean {
  if (o.isApp) return true;
  return o.words < 150;
}
