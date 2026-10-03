// Ads autopilot rules (PRD section 6 "Autonomous ads"): which mode a budget gets, what ad copy may say, when caps
// stop spending, what the optimizer may do, and a deterministic simulator for test mode. Pure, tested on their own.
import { createHash } from 'node:crypto';

export type AdGoal = 'signups' | 'traffic' | 'installs';
export type AdMode = 'test' | 'autopilot';

/** Autopilot unlocks at $10/day; below that the AI launches and reports but makes no optimization claims. */
export const AUTOPILOT_MIN_DAILY_CENTS = 1000;
/** Autopilot waits for a 7-day test before it changes anything. */
export const MIN_TEST_DAYS = 7;
export const modeFor = (dailyCapCents: number): AdMode => (dailyCapCents >= AUTOPILOT_MIN_DAILY_CENTS ? 'autopilot' : 'test');

/** Split a daily budget across ads in whole cents; never more than the total. */
export function splitBudget(totalCents: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0) || w.length;
  const raw = w.map((x) => (sum === w.length && !w.some(Boolean) ? 1 : x) / (w.some(Boolean) ? sum : w.length) * totalCents);
  const out = raw.map(Math.floor);
  let left = totalCents - out.reduce((a, b) => a + b, 0);
  for (const i of raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) { if (left <= 0) break; out[i]!++; left--; }
  return out;
}

// ---------------------------------------------------------------- policy pre-check
export type SpecialCategory = 'credit' | 'employment' | 'housing' | 'social_issues';
const RULES: { re: RegExp; flag: string }[] = [
  { re: /\b(are you|do you have|you're|you are|feeling)\s+(still\s+)?(in debt|broke|poor|overweight|fat|depressed|anxious|lonely|diabetic|sick|ill|infertile|single|bankrupt|struggling with)/i, flag: 'Implies something personal about the viewer (Meta’s personal attributes rule)' },
  { re: /\bguarantee[ds]?\b.{0,30}\b(income|returns?|results?|profits?|approval|loan|earnings?|followers|sales)\b/i, flag: 'Guaranteed results or income' },
  { re: /\b(get rich|double your money|passive income|financial freedom|make \$?\d[\d,]*\s*(k\b)?.{0,15}\b(a|per)\s*(day|week|month)|overnight success)\b/i, flag: 'Unrealistic money claim' },
  { re: /\brisk[- ]free\b/i, flag: '“Risk-free” claim' },
  { re: /\b(before (and|&) after|lose \d+\s?(lbs|pounds|kg)|cures?\b|miracle|clinically proven)\b/i, flag: 'Health claim or before/after' },
  { re: /\b(only \d+ (spots?|left|seats?)|last chance|ends tonight|expires (today|tonight)|act now)\b/i, flag: 'Pressure or scarcity that may not be true' },
  { re: /(#1\b|\b(number one|best[- ]rated|top[- ]rated|5[- ]star|award[- ]winning)\b)/i, flag: 'Ranking or rating claim needs proof' },
  { re: /\b(crypto|bitcoin|token sale|nft)\b/i, flag: 'Crypto ads need Meta’s written permission' },
  { re: /\b(no credit check|instant (loan )?approval|bad credit ok)\b/i, flag: 'Credit claim regulators watch closely' },
  { re: /[A-Z]{6,}|!{2,}/, flag: 'Shouting (all caps or “!!”) gets ads rejected' },
];
const SPECIAL: { cat: SpecialCategory; re: RegExp }[] = [
  { cat: 'credit', re: /\b(loans?|lending|credit cards?|credit scores?|mortgages?|financing|line of credit|bnpl|buy now,? pay later|overdraft)\b/i },
  { cat: 'employment', re: /\b(jobs? (board|listings?|openings?)|hiring|recruit(ing|ment|er)?|job seekers?|vacanc(y|ies)|apply for (a )?jobs?)\b/i },
  { cat: 'housing', re: /\b(apartments?|rentals?|real estate|housing|landlords?|tenants?|home (loans?|insurance)|property listings?)\b/i },
  { cat: 'social_issues', re: /\b(elections?|voting|vote for|political|politicians?|immigration|abortion|gun (rights|control)|climate policy)\b/i },
];

/** What in this ad copy is likely to break platform rules, and whether the product falls in a special category. */
export function policyCheck(copy: string, productFacts = ''): { flags: string[]; special: SpecialCategory | null } {
  const flags = [...new Set(RULES.filter((r) => r.re.test(copy)).map((r) => r.flag))];
  const special = SPECIAL.find((s) => s.re.test(`${productFacts} ${copy}`))?.cat ?? null;
  return { flags, special };
}

// ---------------------------------------------------------------- caps and anomalies
export interface Caps { dailyCapCents: number; totalCapCents: number }
/** Where spending stands against the caps: fine, done for today, or done for good. */
export function capState(spentTodayCents: number, spentTotalCents: number, c: Caps): 'ok' | 'daily' | 'total' {
  if (spentTotalCents >= c.totalCapCents) return 'total';
  if (spentTodayCents >= c.dailyCapCents) return 'daily';
  return 'ok';
}
/** A platform spending more than 10% past the daily cap, or a sudden jump, is an anomaly: pause and tell the founder. */
export function anomaly(spentTodayCents: number, c: Caps, typicalDayCents?: number): string | null {
  if (spentTodayCents > c.dailyCapCents * 1.1) return `Spent ${money(spentTodayCents)} today against a ${money(c.dailyCapCents)} daily cap`;
  if (typicalDayCents && typicalDayCents >= 200 && spentTodayCents > typicalDayCents * 3 && spentTodayCents > c.dailyCapCents * 0.5) return `Spending jumped to ${money(spentTodayCents)} from about ${money(typicalDayCents)} a day`;
  return null;
}
export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

// ---------------------------------------------------------------- the optimizer
export interface AdStats { id: string; status: string; budget_cents: number; spend_cents: number; impressions: number; clicks: number; conversions: number; ctr_first3: number | null; ctr_last3: number | null; impressions_last3: number }
export type OptimizeAction =
  | { type: 'pause'; adId: string; reason: string }
  | { type: 'budget'; adId: string; cents: number; reason: string }
  | { type: 'refresh'; adId: string; reason: string };

const costPer = (a: AdStats, goal: AdGoal) => {
  const n = goal === 'traffic' ? a.clicks : a.conversions;
  return n > 0 ? a.spend_cents / n : Infinity;
};

/**
 * What autopilot does after the 7-day test, over the last 7 days of data:
 *  - pause clear losers (cost per result 2.5x the best, or no results after spending 3x the best's cost),
 *    never the last ad running;
 *  - move the daily budget towards winners (by cost per result; every ad keeps at least 10%);
 *  - refresh an ad whose click rate fell by 40% or more since its first days.
 * Test mode and campaigns younger than 7 days get nothing: there isn't enough data to claim anything.
 */
export function optimize(c: { mode: AdMode; goal: AdGoal; daily_cap_cents: number; age_days: number }, ads: AdStats[]): { actions: OptimizeAction[]; note: string } {
  if (c.mode === 'test') return { actions: [], note: 'Test mode: the budget is too small to tell winners from luck, so we report and don’t optimize.' };
  if (c.age_days < MIN_TEST_DAYS) return { actions: [], note: `Day ${Math.floor(c.age_days) + 1} of the ${MIN_TEST_DAYS}-day test. No changes until it ends.` };
  const active = ads.filter((a) => a.status === 'active');
  if (!active.length) return { actions: [], note: 'No ads running.' };
  const unit = c.goal === 'traffic' ? 'click' : c.goal === 'installs' ? 'install' : 'signup';
  const costs = active.map((a) => costPer(a, c.goal));
  const best = Math.min(...costs);
  const actions: OptimizeAction[] = [];
  const paused = new Set<string>();
  const ranked = active.map((a, i) => ({ a, cost: costs[i]! })).sort((x, y) => y.cost - x.cost);
  for (const { a, cost } of ranked) {
    if (active.length - paused.size <= 1) break;
    if (!Number.isFinite(best)) {
      if (a.spend_cents >= c.daily_cap_cents * 2 && cost === Infinity && ranked.some((r) => r.a.id !== a.id && r.a.clicks > a.clicks * 2)) { paused.add(a.id); actions.push({ type: 'pause', adId: a.id, reason: `No ${unit}s after ${money(a.spend_cents)}, and other ads get far more clicks` }); }
      continue;
    }
    if (a.spend_cents < best * 3 && cost === Infinity) continue;   // too little spent to judge
    if (cost === Infinity) { paused.add(a.id); actions.push({ type: 'pause', adId: a.id, reason: `No ${unit}s after ${money(a.spend_cents)}; the best ad gets one for ${money(Math.round(best))}` }); }
    else if (cost >= best * 2.5) { paused.add(a.id); actions.push({ type: 'pause', adId: a.id, reason: `${money(Math.round(cost))} per ${unit} vs ${money(Math.round(best))} for the best ad` }); }
  }
  const keep = active.filter((a) => !paused.has(a.id));
  const weights = keep.map((a) => { const k = costPer(a, c.goal); return Number.isFinite(k) ? 1 / k : 1 / (best * 2 || 1); });
  const total = weights.reduce((x, y) => x + y, 0);
  const floor = 0.1;
  const shares = weights.map((w) => floor + (1 - floor * keep.length) * (w / total));
  const budgets = splitBudget(c.daily_cap_cents, shares);
  keep.forEach((a, i) => {
    const cents = budgets[i]!;
    if (Math.abs(cents - a.budget_cents) >= Math.max(50, a.budget_cents * 0.1)) actions.push({ type: 'budget', adId: a.id, cents, reason: cents > a.budget_cents ? `Winning: ${Number.isFinite(costPer(a, c.goal)) ? `${money(Math.round(costPer(a, c.goal)))} per ${unit}` : 'best click rate'}` : `Moving budget to better ads` });
  });
  for (const a of keep) {
    if (a.ctr_first3 && a.ctr_last3 != null && a.impressions_last3 >= 1000 && a.ctr_last3 <= a.ctr_first3 * 0.6) {
      actions.push({ type: 'refresh', adId: a.id, reason: `Click rate fell from ${(a.ctr_first3 * 100).toFixed(1)}% to ${(a.ctr_last3 * 100).toFixed(1)}%: people have seen it too often` });
    }
  }
  return { actions, note: actions.length ? '' : 'All ads are within range. No changes today.' };
}

// ---------------------------------------------------------------- test-mode simulator
function rand(seed: string) {
  const h = createHash('sha256').update(seed).digest();
  return (i: number) => h.readUInt32BE((i * 4) % 28) / 0xffffffff;
}
/** Each simulated ad has a fixed "quality" (0.5 to 1.5) so variants really differ, the way real ads do. */
export const simQuality = (adKey: string) => 0.5 + rand(`q:${adKey}`)(0);
/**
 * One simulated day for an ad: spends up to its budget (part of it for today so far), $6-10 CPM, 0.6-2% CTR and
 * 4-14% of clicks converting, all scaled by the ad's quality. Deterministic, so tests and reports are stable.
 */
export function simulateDay(adKey: string, day: string, budgetCents: number, fractionOfDay = 1, overspend = 1) {
  const r = rand(`${adKey}:${day}`);
  const q = simQuality(adKey);
  const spend = Math.floor(budgetCents * Math.min(1, Math.max(0, fractionOfDay)) * (0.86 + r(1) * 0.14) * overspend);
  const impressions = Math.floor((spend / (600 + r(2) * 400)) * 1000);
  const clicks = Math.floor(impressions * (0.006 + r(3) * 0.014) * q);
  const conversions = Math.floor(clicks * (0.04 + r(4) * 0.1) * q);
  return { spend_cents: spend, impressions, clicks, conversions };
}
