// Community safety pre-flight (PRD section 17). The founder's browser gathers the facts (subreddit rules,
// their own recent history); this decides ok / warn / block with reasons a person can act on.

export interface PreflightInput {
  subreddit: string;
  rules: { short_name: string; description?: string }[];
  /** Null when the founder isn't logged in to Reddit. */
  account: { name: string; karma: number; created_utc: number } | null;
  /** The founder's own recent posts and comments, newest first (up to ~100). */
  recent: { subreddit: string; text: string; url?: string; removed: boolean }[];
  reply: string;
  brand: { name: string; url: string | null };
}

export type Level = 'ok' | 'warn' | 'block';
export interface PreflightResult {
  verdict: Level;
  reasons: { level: Level; text: string }[];
  selfPromoRatio: number | null;
  pastRemovals: number;
  ruleSummary: string;
}

const NO_PROMO = /self[- ]?promo|promot|advertis|\bspam|affiliate|soliciting|marketing|no plugs?\b/i;
const NO_LINKS = /no (external )?links|links? (are|is) not allowed|don'?t post links|no url/i;
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|io|app|co|ng|dev|ai|net|org)\b/i;

function host(url: string | null) {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

/** True when text names the product or links to its site. */
export function mentionsBrand(text: string, brand: PreflightInput['brand']) {
  const h = host(brand.url);
  const name = brand.name.trim();
  return (!!name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) || (!!h && text.toLowerCase().includes(h));
}

export function preflight(input: PreflightInput): PreflightResult {
  const reasons: PreflightResult['reasons'] = [];
  const sub = input.subreddit.replace(/^r\//i, '');
  const reply = input.reply.trim();
  if (!reply) reasons.push({ level: 'block', text: 'There’s nothing to post yet.' });

  // Account
  if (!input.account) {
    reasons.push({ level: 'warn', text: 'You’re not logged in to Reddit, so we couldn’t check your account history.' });
  } else {
    const ageDays = (Date.now() / 1000 - input.account.created_utc) / 86_400;
    if (ageDays < 7) reasons.push({ level: 'warn', text: 'Your account is less than a week old. Many subreddits hide posts from new accounts.' });
    if (input.account.karma < 20) reasons.push({ level: 'warn', text: 'Your karma is low. Some subreddits filter low-karma accounts, so the reply may not show up.' });
  }

  // Self-promotion ratio over the founder's own recent activity (Reddit's rough guide: about 1 in 10).
  let ratio: number | null = null;
  if (input.recent.length >= 5) {
    const promo = input.recent.filter((r) => mentionsBrand(`${r.text} ${r.url ?? ''}`, input.brand)).length;
    ratio = promo / input.recent.length;
    const pct = Math.round(ratio * 100);
    if (ratio > 0.25) reasons.push({ level: 'block', text: `${pct}% of your recent posts mention ${input.brand.name}. That reads as self-promotion; Reddit's guide is about 1 in 10. Post some replies without it first.` });
    else if (ratio > 0.1) reasons.push({ level: 'warn', text: `${pct}% of your recent posts mention ${input.brand.name}. Keep it near 1 in 10 so you aren't flagged as a promoter.` });
  }

  // Past removals
  const here = input.recent.filter((r) => r.removed && r.subreddit.toLowerCase() === sub.toLowerCase()).length;
  const all = input.recent.filter((r) => r.removed).length;
  if (here >= 3) reasons.push({ level: 'block', text: `Moderators removed ${here} of your recent posts in r/${sub}. Another one could get you banned there.` });
  else if (here >= 1) reasons.push({ level: 'warn', text: `Moderators removed ${here === 1 ? 'one of your recent posts' : `${here} of your recent posts`} in r/${sub}. Read the rules before posting.` });
  else if (all >= 5) reasons.push({ level: 'warn', text: `${all} of your recent posts were removed across Reddit. Slow down on promotional replies.` });

  // Subreddit rules vs this reply
  const promoRule = input.rules.find((r) => NO_PROMO.test(`${r.short_name} ${r.description ?? ''}`));
  const linkRule = input.rules.find((r) => NO_LINKS.test(`${r.short_name} ${r.description ?? ''}`));
  const hasLink = LINK.test(reply);
  const names = mentionsBrand(reply, input.brand);
  if (linkRule && hasLink) reasons.push({ level: 'block', text: `r/${sub} rule “${linkRule.short_name}”: remove the link before posting.` });
  if (promoRule && names && hasLink && !linkRule) reasons.push({ level: 'block', text: `r/${sub} rule “${promoRule.short_name}”: a link to your own product will likely be removed. Drop the link and keep the answer helpful.` });
  else if (promoRule && names) reasons.push({ level: 'warn', text: `r/${sub} rule “${promoRule.short_name}”: only mention ${input.brand.name} if it directly answers the question, and say you built it.` });

  const verdict: Level = reasons.some((r) => r.level === 'block') ? 'block' : reasons.some((r) => r.level === 'warn') ? 'warn' : 'ok';
  if (verdict === 'ok') reasons.push({ level: 'ok', text: input.rules.length ? `Checked r/${sub}'s ${input.rules.length} rules and your history. Looks fine.` : `r/${sub} lists no rules, and your history looks fine.` });
  return { verdict, reasons, selfPromoRatio: ratio, pastRemovals: here, ruleSummary: input.rules.slice(0, 4).map((r) => r.short_name).join(' · ') };
}
