// Reading Reddit from the founder's own logged-in browser, through Reddit's JSON views of the same pages.
// Pure functions: everything here is tested against saved responses.

export interface RedditPost { id: string; subreddit: string; title: string; text: string; author: string | null; url: string; created_utc: number | null; comments: number; locked: boolean }
export interface RecentItem { subreddit: string; text: string; url?: string; removed: boolean }
export interface Account { name: string; karma: number; created_utc: number }

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export type Page =
  | { kind: 'thread'; subreddit: string; id: string; jsonUrl: string }
  | { kind: 'listing'; subreddit: string | null; jsonUrl: string }
  | { kind: 'other' };

/** What kind of Reddit page this is, and where its JSON lives. */
export function pageOf(href: string): Page {
  const u = new URL(href);
  const path = u.pathname.replace(/\/+$/, '');
  const thread = path.match(/^\/r\/([^/]+)\/comments\/([a-z0-9]+)/i);
  if (thread) return { kind: 'thread', subreddit: thread[1]!, id: `t3_${thread[2]!.toLowerCase()}`, jsonUrl: `${u.origin}${path}.json?limit=1` };
  const sub = path.match(/^\/r\/([^/]+)(\/(hot|new|top|rising|best|controversial))?$/i);
  if (sub) return { kind: 'listing', subreddit: sub[1]!, jsonUrl: `${u.origin}${path || '/'}.json${u.search ? `${u.search}&` : '?'}limit=25` };
  if (path === '/search' || /^\/r\/[^/]+\/search$/i.test(path)) {
    const q = new URLSearchParams(u.search);
    q.set('limit', '25');
    if (!q.get('sort')) q.set('sort', 'new');
    return { kind: 'listing', subreddit: path.match(/^\/r\/([^/]+)/)?.[1] ?? null, jsonUrl: `${u.origin}${path}.json?${q}` };
  }
  if (path === '' || /^\/(hot|new|top|rising|best)$/.test(path)) return { kind: 'listing', subreddit: null, jsonUrl: `${u.origin}${path || '/'}.json?limit=25` };
  return { kind: 'other' };
}

function toPost(d: Json, origin = 'https://www.reddit.com'): RedditPost | null {
  const id = str(d.name);
  if (!/^t3_/.test(id) || d.stickied === true || d.promoted === true) return null;
  return {
    id, subreddit: str(d.subreddit), title: str(d.title), text: str(d.selftext).slice(0, 3000), author: str(d.author) || null,
    url: `${origin.replace('old.', 'www.')}${str(d.permalink)}`, created_utc: typeof d.created_utc === 'number' ? d.created_utc : null,
    comments: Number(d.num_comments) || 0, locked: d.locked === true || d.archived === true,
  };
}

/** Posts from a subreddit, front page or search listing. */
export function parseListing(json: unknown, origin?: string): RedditPost[] {
  const children = obj(obj(json).data).children;
  return (Array.isArray(children) ? children : []).map((c) => obj(c)).filter((c) => c.kind === 't3').map((c) => toPost(obj(c.data), origin)).filter((p): p is RedditPost => !!p);
}

/** The post at the top of a thread (`/comments/<id>.json` returns [post listing, comments listing]). */
export function parseThread(json: unknown, origin?: string): RedditPost | null {
  const first = Array.isArray(json) ? json[0] : json;
  return parseListing(first, origin)[0] ?? null;
}

export function parseMe(json: unknown): Account | null {
  const d = obj(obj(json).data ?? json);
  const name = str(d.name);
  if (!name) return null;
  const karma = Number(d.total_karma ?? (Number(d.link_karma) || 0) + (Number(d.comment_karma) || 0)) || 0;
  return { name, karma, created_utc: Number(d.created_utc) || Date.now() / 1000 };
}

/** The founder's own recent posts and comments, with removals spotted. */
export function parseRecent(json: unknown): RecentItem[] {
  const children = obj(obj(json).data).children;
  return (Array.isArray(children) ? children : []).map((c) => {
    const o = obj(c); const d = obj(o.data);
    const body = o.kind === 't1' ? str(d.body) : `${str(d.title)} ${str(d.selftext)}`;
    const removed = d.removed_by_category != null || d.banned_by != null || str(d.body) === '[removed]' || str(d.selftext) === '[removed]';
    return { subreddit: str(d.subreddit), text: body.slice(0, 2000), url: str(d.url) || undefined, removed };
  });
}

export function parseRules(json: unknown): { short_name: string; description: string }[] {
  const rules = obj(json).rules;
  return (Array.isArray(rules) ? rules : []).map((r) => ({ short_name: str(obj(r).short_name), description: str(obj(r).description).slice(0, 1000) })).filter((r) => r.short_name);
}

export function ago(utc: number | null) {
  if (!utc) return '';
  const m = Math.round((Date.now() / 1000 - utc) / 60);
  if (m < 60) return `${Math.max(1, m)}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}
