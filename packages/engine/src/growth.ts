// Growth analysis rules (PRD section 23): channel playbooks by product type, what a site shows about its presence,
// and the growth score. Pure, so the plan and the score are the same every time for the same facts.

export type ProductType = 'b2b_saas' | 'consumer_app' | 'dev_tool' | 'marketplace' | 'ecommerce' | 'other';
export type Stage = 'pre_launch' | 'just_launched' | 'growing';
export type Fit = 'launching_soon' | 'already_live' | 'exploring';
export const PRODUCT_TYPES: ProductType[] = ['b2b_saas', 'consumer_app', 'dev_tool', 'marketplace', 'ecommerce', 'other'];
export const TYPE_LABEL: Record<ProductType, string> = { b2b_saas: 'B2B SaaS', consumer_app: 'Consumer app', dev_tool: 'Developer tool', marketplace: 'Marketplace', ecommerce: 'E-commerce', other: 'Other' };

/** Every channel we can run, what it is, and which account it needs (null: nothing to connect). */
export const CHANNELS = {
  linkedin: { name: 'LinkedIn', connect: 'linkedin' },
  seo: { name: 'SEO: comparison and “alternative to” pages', connect: null },
  hn: { name: 'Hacker News', connect: null },
  email: { name: 'Email', connect: null },
  x: { name: 'X', connect: 'x' },
  directories: { name: 'Startup directories', connect: null },
  demo: { name: 'Demo booking', connect: null },
  tiktok: { name: 'TikTok', connect: 'tiktok' },
  reels: { name: 'Instagram Reels', connect: 'instagram' },
  ugc: { name: 'UGC format remix', connect: null },
  creators: { name: 'Creators', connect: null },
  aso: { name: 'App Store optimization', connect: null },
  reddit: { name: 'Reddit (Chrome extension)', connect: 'reddit' },
  github: { name: 'GitHub', connect: 'github' },
  technical: { name: 'Technical content', connect: null },
  devto: { name: 'Dev.to', connect: null },
  short_video: { name: 'Short video', connect: null },
  community: { name: 'Community posts', connect: null },
  referrals: { name: 'Referrals', connect: null },
  ads: { name: 'Ads (Scale)', connect: null },
  waitlist: { name: 'Waitlist page', connect: null },
} as const;
export type ChannelId = keyof typeof CHANNELS;

/** PRD section 23 playbooks: lead channels first, then supporting ones, each with why it fits this kind of product. */
export const PLAYBOOKS: Record<ProductType, { lead: [ChannelId, string][]; support: [ChannelId, string][] }> = {
  b2b_saas: {
    lead: [['linkedin', 'Buyers of business software spend their work day here.'], ['seo', 'People compare tools before they buy; be the page they find.'], ['hn', 'Founders and engineers here try new tools early.'], ['email', 'Business buyers decide over days; email keeps you in the room.']],
    support: [['x', 'Build in public and reach early adopters.'], ['directories', 'Quick backlinks and early traffic.'], ['demo', 'Higher-priced plans close faster with a call.']],
  },
  consumer_app: {
    lead: [['tiktok', 'Consumer apps spread through short video.'], ['reels', 'Same videos, a second audience, almost no extra work.'], ['ugc', 'Remix formats already working in your niche.'], ['creators', 'A creator’s post reaches people who already trust them.']],
    support: [['x', 'Updates and launch moments.'], ['aso', 'Most installs start with an App Store search.'], ['reddit', 'Answer people asking for an app like yours.']],
  },
  dev_tool: {
    lead: [['hn', 'Where developers find new tools.'], ['github', 'Stars, README and releases are your storefront.'], ['reddit', 'Developer subreddits ask for tools every day.'], ['technical', 'Show how it works; developers trust code, not claims.']],
    support: [['x', 'The developer community talks here.'], ['devto', 'Technical posts reach developers searching for answers.'], ['directories', 'Developer tool lists bring steady traffic.']],
  },
  marketplace: {
    lead: [['short_video', 'Show the supply: real listings, real people.'], ['creators', 'Creators bring both sides at once.'], ['community', 'Local and niche communities fill each side.']],
    support: [['seo', 'Every listing can be a page people find.'], ['referrals', 'Each side invites the other.'], ['ads', 'Once a side converts, put budget behind it.']],
  },
  ecommerce: {
    lead: [['reels', 'Products sell when people see them in use.'], ['tiktok', 'Discovery happens in the feed.'], ['ugc', 'Customer-style videos convert better than polished ads.'], ['creators', 'Seeding to creators drives first sales.']],
    support: [['ads', 'Retarget visitors who didn’t buy.'], ['email', 'Repeat purchases come from your list.']],
  },
  other: {
    lead: [['x', 'Reach early adopters fast.'], ['linkedin', 'A professional audience that shares useful things.'], ['seo', 'People searching for a solution find you for years.']],
    support: [['reddit', 'Answer people already asking.'], ['directories', 'Quick backlinks and early traffic.'], ['email', 'Keep the people who are interested.']],
  },
};

export interface PlannedChannel { id: ChannelId; name: string; rank: number; role: 'lead' | 'support'; reason: string; enabled: boolean; connect: string | null }

/**
 * The channel plan for this product: the playbook for its type, adjusted for its stage and what the founder can use.
 * Pre-launch products get a waitlist page first; ads stay off below Scale; poor-fit channels from other playbooks
 * are listed switched off so the founder sees why.
 */
export function channelPlan(type: ProductType, o: { stage: Stage; fit?: Fit | null; plan?: string; hasAppStore?: boolean } ): PlannedChannel[] {
  const pb = PLAYBOOKS[type];
  const rows: Omit<PlannedChannel, 'rank'>[] = [];
  const add = (id: ChannelId, role: 'lead' | 'support', reason: string, enabled = true) => { if (!rows.some((r) => r.id === id)) rows.push({ id, name: CHANNELS[id].name, role, reason, enabled, connect: CHANNELS[id].connect }); };
  const pre = o.stage === 'pre_launch' || o.fit === 'launching_soon';
  if (pre) add('waitlist', 'lead', 'You’re not live yet: collect signups now so launch day has an audience.');
  for (const [id, why] of pb.lead) add(id, 'lead', why);
  for (const [id, why] of pb.support) {
    if (id === 'ads') add(id, 'support', o.plan === 'scale' ? why : `${why} Available on Scale, once organic posts show what works.`, o.plan === 'scale' && !pre);
    else if (id === 'aso') add(id, 'support', o.hasAppStore ? why : `${why} Add your App Store link to switch this on.`, !!o.hasAppStore);
    else add(id, 'support', why);
  }
  // Poor fits, shown off with the reason, so nothing is hidden.
  const poor: Partial<Record<ProductType, [ChannelId, string][]>> = {
    b2b_saas: [['tiktok', 'Business buyers rarely discover software on TikTok.']],
    consumer_app: [['linkedin', 'People don’t look for consumer apps at work.']],
    dev_tool: [['tiktok', 'Developers don’t pick tools from short video.']],
    ecommerce: [['hn', 'Hacker News isn’t a shopping audience.']],
  };
  for (const [id, why] of poor[type] ?? []) add(id, 'support', why, false);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** The accounts a plan needs connected: only those for enabled channels. */
export const accountsFor = (plan: PlannedChannel[]) => [...new Set(plan.filter((c) => c.enabled && c.connect).map((c) => c.connect!))];

// ---------------------------------------------------------------- presence
export interface Presence { socials: string[]; blog: boolean; reviews: string[]; appStore: boolean; playStore: boolean; analytics: boolean; newsletter: boolean }
const SOCIAL: [RegExp, string][] = [[/(?:twitter|x)\.com\/(?!intent|share|home)[\w]+/i, 'x'], [/linkedin\.com\/(company|in)\//i, 'linkedin'], [/instagram\.com\/[\w.]+/i, 'instagram'], [/tiktok\.com\/@/i, 'tiktok'], [/youtube\.com\/(@|c\/|channel\/)/i, 'youtube'], [/facebook\.com\/[\w.]+/i, 'facebook'], [/github\.com\/[\w-]+/i, 'github'], [/discord\.(gg|com\/invite)/i, 'discord'], [/bsky\.app\/profile/i, 'bluesky']];

/** What the site shows about where the product already is: social accounts, blog, reviews, app stores, analytics. */
export function presenceFrom(html: string, url = ''): Presence {
  const hrefs = (html.match(/href\s*=\s*["']([^"']+)["']/gi) ?? []).map((h) => h.replace(/^href\s*=\s*["']/i, '').replace(/["']$/, '')).join(' ');
  const all = `${hrefs} ${url}`;
  return {
    socials: SOCIAL.filter(([re]) => re.test(hrefs)).map(([, n]) => n),
    blog: /\/(blog|articles|posts|changelog|news)(\/|["'\s]|$)/i.test(hrefs),
    reviews: [['producthunt.com', 'Product Hunt'], ['g2.com', 'G2'], ['trustpilot.com', 'Trustpilot'], ['capterra.com', 'Capterra']].filter(([d]) => all.includes(d!)).map(([, n]) => n!),
    appStore: /apps\.apple\.com/i.test(all),
    playStore: /play\.google\.com\/store/i.test(all),
    analytics: /(googletagmanager|gtag\(|plausible\.io|posthog|umami|fathom|_vercel\/insights|clarity\.ms|segment\.com|mixpanel|cloudflareinsights|shipitloud[^"']*\/t\.js)/i.test(html),
    newsletter: /newsletter|subscribe/i.test(html) && /type\s*=\s*["']email["']/i.test(html),
  };
}

/** A URL from an app store, a repo or a site: hints for the product type before the AI reads anything. */
export function urlHint(url: string): ProductType | null {
  if (/apps\.apple\.com|play\.google\.com\/store/i.test(url)) return 'consumer_app';
  if (/github\.com\/[\w-]+\/[\w.-]+/i.test(url) || /npmjs\.com\/package/i.test(url)) return 'dev_tool';
  if (/myshopify\.com/i.test(url)) return 'ecommerce';
  return null;
}

// ---------------------------------------------------------------- growth score
export interface GrowthScoreInput { pageIssues: { clarity: number; cta: number; trust: number }; presence: Presence; hasPricing: boolean; hasEmailForm: boolean; competitorsKnown: number }
/**
 * How ready the product is to get users, out of 100: a clear page that asks for one thing, reasons to trust it,
 * places people can find it, and a way to measure what works. Every point maps to a fix we can do.
 */
export function growthScore(s: GrowthScoreInput): { score: number; parts: { label: string; got: number; of: number; tip: string }[] } {
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
  const parts = [
    { label: 'Clear message', got: clamp(20 - s.pageIssues.clarity * 7, 20), of: 20, tip: 'Say what it does and who it’s for in the headline.' },
    { label: 'One clear next step', got: clamp(15 - s.pageIssues.cta * 5, 15) , of: 15, tip: 'One main button that says what happens.' },
    { label: 'Reasons to trust it', got: clamp(15 - s.pageIssues.trust * 5, 15), of: 15, tip: 'A real quote, who’s behind it, pricing and privacy.' },
    { label: 'Ways to stay in touch', got: s.hasEmailForm ? 10 : s.presence.newsletter ? 6 : 0, of: 10, tip: 'An email form for people who aren’t ready yet.' },
    { label: 'Where people can find you', got: clamp(s.presence.socials.length * 4 + (s.presence.blog ? 6 : 0) + (s.presence.reviews.length ? 4 : 0), 20), of: 20, tip: 'Active accounts on the channels in your plan, and a blog.' },
    { label: 'Measuring what works', got: s.presence.analytics ? 10 : 0, of: 10, tip: 'Add analytics or our snippet to see which channel brings signups.' },
    { label: 'Knowing the competition', got: clamp(s.competitorsKnown * 2 + (s.hasPricing ? 4 : 0), 10), of: 10, tip: 'Show pricing and how you’re different from the alternatives.' },
  ];
  return { score: Math.round(parts.reduce((n, p) => n + p.got, 0)), parts };
}

/**
 * Removes any clause that carries a number the site never says ("would find 50+ users", "doubles clicks").
 * Returns '' when nothing honest is left, so the caller can drop the item.
 */
export function scrubNumbers(text: string, facts: string): string {
  const known = new Set((facts.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]+$/, '').replace(/,/g, '')));
  const bad = (part: string) => (part.match(/\d[\d,.]*/g) ?? []).some((n) => !known.has(n.replace(/[,.]+$/, '').replace(/,/g, '')))
    || /\b(doubles?|triples?|10x|tenfold)\b/i.test(part);
  return text.split(/(?<=[.!?])\s+/).map((sentence) => {
    if (!bad(sentence)) return sentence;
    const kept = sentence.split(/(?:;|,|\s+and\s+)\s*/).filter((c) => c.trim() && !bad(c));
    return kept.length && kept[0]!.split(/\s+/).length >= 4 ? `${kept.join(', ').replace(/[,;\s]+$/, '')}.` : '';
  }).filter(Boolean).join(' ').replace(/\.\./g, '.').trim();
}
