// The ShipItLoud panel on Reddit. Reads Reddit through its own JSON views in this browser, scores posts,
// drafts replies and runs the safety pre-flight. It never posts: the founder pastes and clicks post.
import { ago, pageOf, parseListing, parseMe, parseRecent, parseRules, parseThread, type Account, type RecentItem, type RedditPost } from './reddit.ts';
import { api, type Me, type Scored, type Verdict } from './shared.ts';
import { CSS, LOGO } from './panel-style.ts';

type El = HTMLElement;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | ((e: Event) => void)> = {}, ...kids: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false) el.setAttribute(k, v);
  }
  for (const k of kids) if (k !== null && k !== false) el.append(k);
  return el;
}
const svg = (markup: string) => { const t = document.createElement('template'); t.innerHTML = markup; return t.content.firstElementChild!; };

// ---------------------------------------------------------------- mount
const host = document.createElement('div');
host.id = 'shipitloud-root';
host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000; right: 16px; bottom: 16px;';
const shadow = host.attachShadow({ mode: 'open' });
shadow.append(h('style', {}, CSS));
const wrap = h('div', { class: 'wrap' });
shadow.append(wrap);
document.documentElement.append(host);

let open = sessionStorage.getItem('sil-open') === '1' || new URL(location.href).searchParams.get('sil') === '1';
let me: Me | null = null;
let meError = '';
let pageKey = '';
const cache: { account?: Account | null; recent?: RecentItem[]; rules: Map<string, { short_name: string; description: string }[]> } = { rules: new Map() };

const fetchJson = async (url: string) => {
  const r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`reddit ${r.status}`);
  return r.json();
};

function render(body: El, count?: number) {
  wrap.replaceChildren();
  if (!open) {
    wrap.append(h('button', { class: 'pill', onclick: () => { open = true; sessionStorage.setItem('sil-open', '1'); run(true); }, 'aria-label': 'Open ShipItLoud' },
      svg(LOGO), h('span', {}, 'ShipItLoud'), count ? h('b', { class: 'count' }, String(count)) : null));
    return;
  }
  wrap.append(h('section', { class: 'panel', role: 'dialog', 'aria-label': 'ShipItLoud' },
    h('header', {}, svg(LOGO), h('div', { class: 'who' }, h('b', {}, 'ShipItLoud'), me ? h('span', {}, me.workspace.name) : null),
      h('button', { class: 'x', 'aria-label': 'Close', onclick: () => { open = false; sessionStorage.setItem('sil-open', '0'); run(true); } }, '×')),
    h('div', { class: 'body' }, body)));
}

const shimmer = (n = 3) => h('div', { class: 'list' }, ...Array.from({ length: n }, () => h('div', { class: 'sk-row' }, h('i', { class: 'sk', style: 'width:34px;height:22px' }), h('div', { class: 'sk-col' }, h('i', { class: 'sk' }), h('i', { class: 'sk', style: 'width:60%' })))));
/** Reddit sometimes asks the browser to prove it's human; reading pauses until the founder does. */
const blockedNote = () => (/prove your humanity|not a robot|you've been blocked/i.test(document.body?.innerText ?? '') ? note('Reddit wants a quick check', 'Complete Reddit’s “I’m not a robot” check on this page, then reopen ShipItLoud.') : null);
const note = (title: string, text: string, action?: El) => h('div', { class: 'note' }, h('b', {}, title), h('p', {}, text), action ?? null);
const scorePill = (s: Scored, threshold: number) => h('span', { class: `score ${s.score == null ? 'none' : s.score >= 75 ? 'hi' : s.score >= threshold ? 'mid' : 'lo'}`, title: s.rough ? 'Rough score from wording' : 'Relevance score' }, s.score == null ? '–' : String(s.score));

// ---------------------------------------------------------------- listing pages
async function listing(jsonUrl: string) {
  render(shimmer(4));
  let posts: RedditPost[] = [];
  try { posts = parseListing(await fetchJson(jsonUrl), location.origin); } catch { render(blockedNote() ?? note('Couldn’t read this page', 'Reddit didn’t return the posts. Scroll or refresh and try again.')); return; }
  posts = posts.filter((p) => !p.locked).slice(0, 25);
  const r = await api<{ results: Scored[]; threshold: number }>({ path: '/api/ext/score', body: { posts } });
  if (!r.ok) { render(note('Not scored', r.data.error ?? 'Something went wrong.')); return; }
  const threshold = r.data.threshold ?? me?.threshold ?? 60;
  const byId = new Map(r.data.results.map((s) => [s.id, s]));
  const good = posts.map((p) => ({ p, s: byId.get(p.id)! })).filter((x) => x.s?.score != null && x.s.score >= threshold && x.s.status !== 'dismissed').sort((a, b) => b.s.score! - a.s.score!);
  const body = good.length
    ? h('div', {}, h('p', { class: 'sub' }, `${good.length} of ${posts.length} posts here ${good.length === 1 ? 'is' : 'are'} worth a reply`),
      h('div', { class: 'list' }, ...good.map(({ p, s }) => h('a', { class: 'row', href: `${p.url}?sil=1` },
        scorePill(s, threshold),
        h('div', { class: 'row-main' }, h('b', {}, p.title), h('span', {}, `r/${p.subreddit} · ${ago(p.created_utc)} · ${p.comments} comments${s.drafted ? ' · drafted' : ''}`))))))
    : note('Nothing worth a reply here', `We checked ${posts.length} posts against what you listen for. Try the searches in the ShipItLoud toolbar menu.`);
  render(body, good.length);
}

// ---------------------------------------------------------------- thread pages
async function gatherSafety(sub: string) {
  if (cache.account === undefined) {
    try { cache.account = parseMe(await fetchJson(`${location.origin}/api/me.json`)); } catch { cache.account = null; }
  }
  if (cache.account && !cache.recent) {
    try { cache.recent = parseRecent(await fetchJson(`${location.origin}/user/${encodeURIComponent(cache.account.name)}/overview.json?limit=100`)); } catch { cache.recent = []; }
  }
  if (!cache.rules.has(sub)) {
    try { cache.rules.set(sub, parseRules(await fetchJson(`${location.origin}/r/${encodeURIComponent(sub)}/about/rules.json`))); } catch { cache.rules.set(sub, []); }
  }
  return { account: cache.account, recent: cache.recent ?? [], rules: cache.rules.get(sub) ?? [] };
}

function focusComposer() {
  const target = document.querySelector<HTMLElement>('faceplate-textarea-input[name="comment"], comment-composer-host faceplate-textarea-input, shreddit-composer, textarea[name="text"]');
  if (!target) return false;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.click();
  target.focus?.();
  return true;
}

async function thread(jsonUrl: string) {
  render(shimmer(2));
  let post: RedditPost | null = null;
  try { post = parseThread(await fetchJson(jsonUrl), location.origin); } catch { /* handled below */ }
  if (!post) { render(blockedNote() ?? note('Couldn’t read this thread', 'Refresh the page and open ShipItLoud again.')); return; }
  const p = post;
  const r = await api<{ results: Scored[]; threshold: number }>({ path: '/api/ext/score', body: { posts: [p], force: true } });
  if (!r.ok) { render(note('Not available', r.data.error ?? 'Something went wrong.')); return; }
  const s = r.data.results[0]!;
  const threshold = r.data.threshold ?? 60;

  const draftBox = h('div', { class: 'draft' });
  const head = h('div', { class: 'thread' }, scorePill(s, threshold),
    h('div', { class: 'row-main' }, h('b', {}, p.title), h('span', {}, s.reason && !s.rough ? s.reason : s.score != null && s.score >= threshold ? 'Worth a reply' : 'Probably not worth a reply')));
  if (p.locked) { render(h('div', {}, head, note('Thread is closed', 'It’s locked or archived, so replies aren’t possible.'))); return; }

  const start = h('button', { class: 'btn primary', onclick: () => draft() }, s.drafted ? 'Show my draft' : 'Draft a reply');
  draftBox.append(start);
  render(h('div', {}, head, draftBox), s.score != null && s.score >= threshold ? 1 : undefined);

  async function draft() {
    draftBox.replaceChildren(h('p', { class: 'sub' }, h('span', { class: 'spin' }), ' Writing in your voice…'), h('i', { class: 'sk', style: 'height:70px' }));
    const d = await api<{ text: string; flags: string[] }>({ path: '/api/ext/draft', body: { mention_id: s.mention_id } });
    if (!d.ok) { draftBox.replaceChildren(note('No draft', d.data.error ?? 'Try again in a minute.'), start); return; }
    const text = h('textarea', { class: 'text', rows: '7', 'aria-label': 'Your reply' }) as HTMLTextAreaElement;
    text.value = d.data.text;
    const flags = d.data.flags?.length ? h('p', { class: 'flag' }, `Check before posting: ${d.data.flags.join(', ')}`) : null;
    const safety = h('div', { class: 'safety' });
    const copy = h('button', { class: 'btn primary', disabled: true }, 'Copy and reply') as HTMLButtonElement;
    const posted = h('button', { class: 'btn', hidden: true }, 'I posted it') as HTMLButtonElement;
    const hint = h('p', { class: 'sub' });
    draftBox.replaceChildren(text, flags ?? '', safety, h('div', { class: 'actions' }, copy, posted), hint);

    let verdict: Verdict['verdict'] = 'warn';
    let timer = 0;
    const check = async () => {
      safety.replaceChildren(h('p', { class: 'sub' }, h('span', { class: 'spin' }), ` Checking r/${p.subreddit} rules and your history…`));
      copy.disabled = true;
      const facts = await gatherSafety(p.subreddit);
      const v = await api<Verdict>({ path: '/api/ext/preflight', body: { subreddit: p.subreddit, mention_id: s.mention_id, reply: text.value, ...facts } });
      if (!v.ok) { safety.replaceChildren(h('p', { class: 'flag' }, v.data.error ?? 'Safety check failed. Try again.')); return; }
      verdict = v.data.verdict;
      safety.replaceChildren(h('div', { class: `verdict ${verdict}` },
        h('b', {}, verdict === 'ok' ? 'Safe to post' : verdict === 'warn' ? 'Post with care' : 'Don’t post this yet'),
        h('ul', {}, ...v.data.reasons.map((x) => h('li', { class: x.level }, x.text)))));
      copy.disabled = verdict === 'block';
      hint.textContent = verdict === 'block' ? 'Edit the reply above to fix this; we check again as you type.' : '';
    };
    text.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(check, 900); });
    copy.addEventListener('click', async () => {
      if (verdict === 'block') return;
      await navigator.clipboard.writeText(text.value);
      const found = focusComposer();
      copy.textContent = 'Copied';
      posted.hidden = false;
      hint.textContent = found ? 'Paste it into the reply box (Ctrl+V or ⌘V), read it once more, then post.' : 'Copied. Scroll to the reply box, paste it, read it once more, then post.';
    });
    posted.addEventListener('click', async () => {
      posted.disabled = true;
      const res = await api({ path: '/api/ext/replied', body: { mention_id: s.mention_id, text: text.value } });
      draftBox.replaceChildren(res.ok ? note('Logged', 'Nice. It’s in your ShipItLoud activity.') : note('Couldn’t log it', res.data.error ?? 'Try again.'));
    });
    await check();
  }
}

// ---------------------------------------------------------------- main loop
async function run(force = false) {
  const page = pageOf(location.href);
  const key = `${location.pathname}${location.search}|${open}`;
  if (!force && key === pageKey) return;
  pageKey = key;
  if (page.kind === 'other') { wrap.replaceChildren(); return; }
  if (!me && !meError) {
    const r = await api<Me>({ path: '/api/ext/me' });
    if (r.ok) me = r.data; else meError = r.data.error ?? 'Not connected.';
  }
  if (!open) { render(h('div', {})); return; }
  if (!me) { render(note('Connect ShipItLoud', meError || 'Click the ShipItLoud icon in your toolbar and paste your connection from Settings.')); return; }
  if (!me.listening) { render(note('Listening is off for your plan', 'Reddit replies come with the Launch Pass and paid plans.')); return; }
  if (page.kind === 'listing') await listing(page.jsonUrl);
  else await thread(page.jsonUrl);
}

// Reddit is a single-page app: watch for URL changes.
run();
let last = location.href;
setInterval(() => { if (location.href !== last) { last = location.href; run(); } }, 800);
chrome.storage.onChanged.addListener((c) => { if (c.token || c.apiBase) { me = null; meError = ''; run(true); } });
