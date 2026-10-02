// Listening sources. Each returns recent public posts for one query. All free except X (Scale plan, capped).
// Reddit is deliberately absent: the founder's browser reads Reddit through the extension.
import { htmlToText } from './crawl.ts';

export interface Found {
  source: 'hn' | 'bluesky' | 'github' | 'rss' | 'producthunt' | 'x';
  external_id: string;
  url: string;
  author: string | null;
  title: string | null;
  text: string;
  posted_at: string | null;
}

const UA = { 'User-Agent': 'ShipItLoudBot/1.0 (+https://shipitloud.netlify.app)' };

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { ...UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) { console.warn(`[listen] ${new URL(url).hostname} ${res.status}`); return null; }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[listen] ${new URL(url).hostname} ${(err as Error).message}`);
    return null;
  }
}

const clip = (s: string, n = 2000) => (s.length > n ? `${s.slice(0, n)}…` : s);
/** Multi-word queries are searched as exact phrases; loose word matching floods results with noise. */
const phrase = (q: string) => (/\s/.test(q.trim()) ? `"${q.trim().replace(/"/g, '')}"` : q.trim());

export async function searchHN(q: string, since: Date): Promise<Found[]> {
  type Hit = { objectID: string; author: string; title?: string; story_title?: string; comment_text?: string; story_text?: string; created_at: string };
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(phrase(q))}&advancedSyntax=true&typoTolerance=false&tags=(story,comment)&numericFilters=created_at_i>${Math.floor(since.getTime() / 1000)}&hitsPerPage=30`;
  const data = await getJson<{ hits: Hit[] }>(url);
  return (data?.hits ?? []).map((h) => ({
    source: 'hn' as const, external_id: h.objectID, url: `https://news.ycombinator.com/item?id=${h.objectID}`, author: h.author,
    title: h.title ?? h.story_title ?? null, text: clip(htmlToText(h.comment_text ?? h.story_text ?? h.title ?? '')), posted_at: h.created_at,
  })).filter((f) => f.text && f.title !== '[dead]' && f.text !== '[dead]');
}

export async function searchBluesky(q: string, since: Date): Promise<Found[]> {
  type Post = { uri: string; author: { handle: string }; record: { text?: string; createdAt?: string } };
  const url = `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(phrase(q))}&since=${since.toISOString()}&sort=latest&limit=30`;
  const data = await getJson<{ posts: Post[] }>(url);
  return (data?.posts ?? []).map((p) => ({
    source: 'bluesky' as const, external_id: p.uri, url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}`,
    author: p.author.handle, title: null, text: clip(p.record.text ?? ''), posted_at: p.record.createdAt ?? null,
  })).filter((f) => f.text);
}

let githubBlockedUntil = 0;
export async function searchGitHub(q: string, since: Date): Promise<Found[]> {
  if (Date.now() < githubBlockedUntil) return [];
  type Item = { id: number; html_url: string; title: string; body: string | null; user: { login: string } | null; created_at: string };
  const query = `${phrase(q)} is:issue in:title,body created:>${since.toISOString().slice(0, 10)}`;
  const headers: Record<string, string> = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const data = await getJson<{ items: Item[] }>(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=created&order=desc&per_page=20`, headers);
  // Unauthenticated search allows 10 calls a minute; back off for a minute when it says no.
  if (!data) { githubBlockedUntil = Date.now() + 60_000; return []; }
  return data.items.map((i) => ({
    source: 'github' as const, external_id: String(i.id), url: i.html_url, author: i.user?.login ?? null,
    title: i.title, text: clip(i.body ?? i.title), posted_at: i.created_at,
  }));
}

/** RSS/Atom feeds aren't searchable, so we read the latest items and keep the ones that mention a keyword. */
export async function readFeed(feedUrl: string, terms: string[], since: Date): Promise<Found[]> {
  let xml = '';
  try {
    const res = await fetch(feedUrl, { headers: UA, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    xml = (await res.text()).slice(0, 2_000_000);
  } catch { return []; }
  const items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const tag = (s: string, ...names: string[]) => {
    for (const n of names) {
      const m = s.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, 'i'));
      if (m?.[1]) return m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
    }
    return '';
  };
  const lower = terms.map((t) => t.toLowerCase());
  const out: Found[] = [];
  for (const it of items.slice(0, 50)) {
    const title = htmlToText(tag(it, 'title'));
    const text = clip(htmlToText(tag(it, 'description', 'content:encoded', 'content', 'summary')));
    const link = tag(it, 'link') || it.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '';
    const date = tag(it, 'pubDate', 'updated', 'published');
    if (!link || (date && Date.parse(date) < since.getTime())) continue;
    const hay = `${title} ${text}`.toLowerCase();
    if (!lower.some((t) => hay.includes(t))) continue;
    out.push({ source: 'rss', external_id: tag(it, 'guid', 'id') || link, url: link, author: htmlToText(tag(it, 'author', 'dc:creator', 'name')) || null, title, text: text || title, posted_at: date ? new Date(date).toISOString() : null });
  }
  return out;
}

/** Product Hunt has no search; with a developer token we read today's launches and keep keyword matches. */
export async function readProductHunt(terms: string[], since: Date): Promise<Found[]> {
  const token = process.env.PRODUCTHUNT_TOKEN;
  if (!token) return [];
  const query = `{ posts(order: NEWEST, postedAfter: "${since.toISOString()}", first: 50) { edges { node { id name tagline description url createdAt } } } }`;
  try {
    const res = await fetch('https://api.producthunt.com/v2/api/graphql', { method: 'POST', headers: { ...UA, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    type Node = { id: string; name: string; tagline: string; description: string | null; url: string; createdAt: string };
    const data = (await res.json()) as { data?: { posts: { edges: { node: Node }[] } } };
    const lower = terms.map((t) => t.toLowerCase());
    return (data.data?.posts.edges ?? []).map((e) => e.node)
      .filter((n) => lower.some((t) => `${n.name} ${n.tagline} ${n.description ?? ''}`.toLowerCase().includes(t)))
      .map((n) => ({ source: 'producthunt' as const, external_id: n.id, url: n.url, author: null, title: `${n.name}: ${n.tagline}`, text: clip(n.description ?? n.tagline), posted_at: n.createdAt }));
  } catch { return []; }
}

/** X recent search. Only called on the Scale plan with a bearer token; the caller meters reads first. */
export async function searchX(q: string, since: Date, max: number): Promise<Found[]> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return [];
  const start = new Date(Math.max(since.getTime(), Date.now() - 6.9 * 86_400_000)).toISOString();
  type Res = { data?: { id: string; text: string; author_id: string; created_at: string }[]; includes?: { users?: { id: string; username: string }[] } };
  const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(`${q} -is:retweet -is:reply`)}&max_results=${Math.max(10, Math.min(100, max))}&start_time=${start}&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username`;
  const data = await getJson<Res>(url, { Authorization: `Bearer ${token}` });
  const users = new Map((data?.includes?.users ?? []).map((u) => [u.id, u.username]));
  return (data?.data ?? []).map((t) => {
    const handle = users.get(t.author_id) ?? 'i';
    return { source: 'x' as const, external_id: t.id, url: `https://x.com/${handle}/status/${t.id}`, author: handle, title: null, text: clip(t.text), posted_at: t.created_at };
  });
}
