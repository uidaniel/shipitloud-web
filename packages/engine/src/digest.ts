// Weekly digest and the first 7 days report (PRD sections 6 and 9): what happened, what worked, the next three actions.
// Numbers and actions are worked out here, from the data. The AI only puts the week into words, and anything it
// writes is checked against these numbers before it is used.

export interface DigestDay { day: string; conversations: number; replies: number; posts: number; clicks: number; signups: number }
export interface DigestChannel { channel: string; clicks: number; signups: number; posts: number }
export type DigestMetric = 'conversations' | 'replies' | 'posts' | 'clicks' | 'signups';
export const DIGEST_METRICS: DigestMetric[] = ['conversations', 'replies', 'posts', 'clicks', 'signups'];

export interface DigestStats {
  totals: Record<DigestMetric, number>;
  previous: Record<DigestMetric, number> | null;      // null for the first week: nothing to compare with
  best_channel: DigestChannel | null;
  top_link: { url: string; source: string; clicks: number } | null;
  high_intent: number;                                // conversations scoring 70+ this week
}

/** What the workspace has set up and what is waiting, used to pick next actions. */
export interface DigestSignals {
  pending: number;              // items waiting in the inbox
  unanswered: number;           // high-intent conversations nobody replied to yet
  listening: boolean;
  snippet: boolean;             // the signup snippet has been seen on their site
  weekly_plan: boolean;
  published_total: number;      // ever
  blog_posts: number;
  waitlist: boolean;            // has a published waitlist page
  sequence_on: boolean;
}

export interface DigestAction { title: string; why: string; href: string }

const sum = (rows: DigestDay[], k: DigestMetric) => rows.reduce((n, d) => n + (d[k] ?? 0), 0);

/** Totals for the last 7 days of `days`, and the 7 before when there are 14. */
export function digestStats(days: DigestDay[], channels: DigestChannel[], extra: { top_link?: DigestStats['top_link']; high_intent?: number } = {}, first = false): DigestStats {
  const cur = days.slice(-7);
  const prev = days.slice(-14, -7);
  const totals = Object.fromEntries(DIGEST_METRICS.map((k) => [k, sum(cur, k)])) as Record<DigestMetric, number>;
  const previous = first || prev.length < 7 ? null : (Object.fromEntries(DIGEST_METRICS.map((k) => [k, sum(prev, k)])) as Record<DigestMetric, number>);
  const ranked = channels.filter((c) => c.signups + c.clicks > 0).sort((a, b) => b.signups - a.signups || b.clicks - a.clicks);
  return { totals, previous, best_channel: ranked[0] ?? null, top_link: extra.top_link && extra.top_link.clicks > 0 ? extra.top_link : null, high_intent: extra.high_intent ?? 0 };
}

export const quiet = (s: DigestStats) => DIGEST_METRICS.every((k) => s.totals[k] === 0);

/** The three most useful things to do next, most important first. Rules, not guesses. */
export function nextActions(s: DigestStats, g: DigestSignals, base: string): DigestAction[] {
  const out: (DigestAction & { w: number })[] = [];
  const add = (w: number, title: string, why: string, path: string) => out.push({ w, title, why, href: `${base}${path}` });
  if (g.unanswered > 0) add(100, `Reply to ${g.unanswered} ${g.unanswered === 1 ? 'person' : 'people'} looking for what you make`, 'Replies to people already asking are the fastest way to first users.', '/listening');
  if (!g.listening) add(95, 'Turn on Listening', 'We find people talking about the problem you solve, and draft helpful replies.', '/listening');
  if (g.pending > 0) add(90, `Clear your inbox (${g.pending} waiting)`, 'Drafts only go out after you say yes. Some expire if they wait too long.', '/inbox');
  if (!g.snippet) add(85, 'Add the signup snippet to your site', 'Without it we can only count waitlist signups, so we can’t tell you which channel works.', '/analytics#snippet');
  if (s.best_channel && s.best_channel.signups > 0) add(80, `Post more on ${s.best_channel.channel}`, `It brought ${s.best_channel.signups} signup${s.best_channel.signups === 1 ? '' : 's'} in the last 30 days, more than any other channel.`, '/content');
  if (!g.weekly_plan) add(70, 'Let us plan your week every Sunday', 'Five posts land in your inbox for approval, so you never start from a blank page.', '/content');
  if (g.published_total === 0) add(75, 'Publish your first post', 'Nothing has gone out yet. Your launch kit has drafts ready.', '/plan');
  if (g.waitlist && !g.sequence_on) add(60, 'Switch on your waitlist emails', 'A welcome, a referral nudge and launch emails, sent once per person.', '/waitlist#emails');
  if (g.blog_posts === 0) add(50, 'Start your blog with one article', 'Search traffic takes weeks to build, so the first article is worth writing early.', '/blog');
  if (s.totals.posts > 0 && s.totals.clicks === 0) add(65, 'Put your link in your next posts', 'You posted this week but nobody clicked through. A clear link and a reason to click help.', '/content');
  return out.sort((a, b) => b.w - a.w).slice(0, 3).map(({ w: _w, ...a }) => a);
}

const LABEL: Record<DigestMetric, [string, string]> = {
  conversations: ['conversation found', 'conversations found'],
  replies: ['reply posted', 'replies posted'],
  posts: ['post published', 'posts published'],
  clicks: ['click on your links', 'clicks on your links'],
  signups: ['signup', 'signups'],
};
export const metricLine = (k: DigestMetric, n: number) => `${n} ${LABEL[k][n === 1 ? 0 : 1]}`;

/** The plain facts the AI may use. Every number it writes must come from here. */
export function statsBlock(s: DigestStats, kind: 'weekly' | 'first_week'): string {
  const lines = DIGEST_METRICS.map((k) => `- ${metricLine(k, s.totals[k])}${s.previous ? ` (the week before: ${s.previous[k]})` : ''}`);
  if (s.high_intent) lines.push(`- ${s.high_intent} of the conversations were high intent (people actively looking)`);
  if (s.best_channel) lines.push(`- Best channel over the last 30 days: ${s.best_channel.channel} (${s.best_channel.signups} signups, ${s.best_channel.clicks} clicks)`);
  if (s.top_link) lines.push(`- Most clicked link this week: ${s.top_link.url} on ${s.top_link.source} (${s.top_link.clicks} clicks)`);
  return `${kind === 'first_week' ? 'Their first 7 days' : 'The last 7 days'}:\n${lines.join('\n')}`;
}

/** Numbers in `text` that aren't in the stats. Small counting words ("three next steps") are fine. */
export function unknownNumbers(text: string, s: DigestStats): string[] {
  const known = new Set<number>([...Object.values(s.totals), ...Object.values(s.previous ?? {}), s.high_intent, 7, 30,
    s.best_channel?.signups ?? -1, s.best_channel?.clicks ?? -1, s.top_link?.clicks ?? -1]);
  if (s.previous) for (const k of DIGEST_METRICS) { const p = s.previous[k]; if (p) known.add(Math.abs(Math.round(((s.totals[k] - p) / p) * 100))); known.add(Math.abs(s.totals[k] - p)); }
  return (text.match(/\d[\d,.]*%?/g) ?? []).filter((m) => !known.has(Number(m.replace(/[,%]/g, '').replace(/\.$/, ''))));
}

/** A plain summary when there's no AI wording (quiet week, mock, or the AI got a number wrong). */
export function fallbackSummary(s: DigestStats, kind: 'weekly' | 'first_week'): { summary: string; worked: string[] } {
  const when = kind === 'first_week' ? 'In your first 7 days' : 'This week';
  if (quiet(s)) return { summary: `${kind === 'first_week' ? 'Your first 7 days were' : 'This week was'} quiet: nothing went out and nothing came back yet. The steps below are the quickest way to change that.`, worked: [] };
  const parts = DIGEST_METRICS.filter((k) => s.totals[k] > 0).map((k) => metricLine(k, s.totals[k]));
  const worked: string[] = [];
  if (s.best_channel?.signups) worked.push(`${s.best_channel.channel} brought the most signups (${s.best_channel.signups} in the last 30 days).`);
  if (s.top_link) worked.push(`Your most clicked link was on ${s.top_link.source} (${s.top_link.clicks} clicks).`);
  if (s.previous) for (const k of ['signups', 'clicks', 'replies'] as const) if (s.totals[k] > s.previous[k] && s.previous[k] > 0) worked.push(`More ${k} than the week before (${s.totals[k]} vs ${s.previous[k]}).`);
  return { summary: `${when}: ${parts.join(', ')}.`, worked: worked.slice(0, 3) };
}

/** The digest as a plain-text notification body. */
export function digestText(d: { summary: string; worked: string[]; actions: DigestAction[] }): string {
  const w = d.worked.length ? `\n\nWhat worked:\n${d.worked.map((x) => `- ${x}`).join('\n')}` : '';
  const a = d.actions.length ? `\n\nYour next ${d.actions.length === 1 ? 'step' : `${d.actions.length} steps`}:\n${d.actions.map((x, i) => `${i + 1}. ${x.title}: ${x.why}`).join('\n')}` : '';
  return `${d.summary}${w}${a}`;
}
