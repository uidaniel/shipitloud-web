// Launch posts and the 30-day plan (PRD section 5, Stage 1).
import { z } from 'zod';

export interface BrandContext {
  name: string;
  url: string | null;
  one_liner: string | null;
  target_customer: string | null;
  pain_points: string[];
  competitors: string[];
  keywords: string[];
  tone: string | null;
  dos: string[];
  donts: string[];
  launch_date: string | null;
}

export function brandBlock(b: BrandContext) {
  return `Brand: ${b.name}
What it does: ${b.one_liner ?? 'unknown'}
Who it's for: ${b.target_customer ?? 'unknown'}
Problems it solves: ${b.pain_points.join('; ') || 'unknown'}
Alternatives people use: ${b.competitors.join(', ') || 'unknown'}
Phrases people search: ${b.keywords.slice(0, 8).join(', ') || 'unknown'}
Voice: ${b.tone ?? 'clear and friendly'}${b.dos.length ? `\nDo: ${b.dos.join('; ')}` : ''}${b.donts.length ? `\nDon't: ${b.donts.join('; ')}` : ''}
Website: ${b.url ?? 'none yet'}
Launch date: ${b.launch_date ?? 'not set'}`;
}

// ---------------------------------------------------------------- launch posts
export const LAUNCH_POSTS_VERSION = 'launch_posts@1';

export const LaunchPostsSchema = z.object({
  x_thread: z.array(z.string()).describe('4-6 posts, each under 270 characters. Post 1 is the hook.'),
  linkedin: z.string().describe('One LinkedIn post, 600-1200 characters, founder story, line breaks between short paragraphs'),
  reddit: z.object({
    title: z.string().describe('Under 120 characters, no hype, no emoji'),
    body: z.string().describe('300-900 characters. Story and lesson first, product second, ask for feedback'),
    subreddits: z.array(z.string()).describe('2-4 relevant subreddit names without r/'),
  }),
  product_hunt: z.object({
    tagline: z.string().describe('Under 60 characters'),
    description: z.string().describe('Under 260 characters'),
    first_comment: z.string().describe('Maker comment: why you built it, who it is for, what feedback you want. 500-900 characters'),
  }),
  whatsapp: z.object({
    status: z.string().describe('WhatsApp status text, under 140 characters'),
    broadcast: z.string().describe('Personal message to friends and contacts, under 400 characters'),
  }),
});
export type LaunchPosts = z.infer<typeof LaunchPostsSchema>;

export const LAUNCH_POSTS_SYSTEM = `You are the marketing co-founder writing a founder's launch posts. Write as the founder, first person, in the brand's voice.

Rules:
- Every platform has its own culture. X: punchy hook, one idea per post. LinkedIn: honest founder story. Reddit: genuinely useful, humble, no marketing speak, follows self-promotion norms. Product Hunt: clear and friendly. WhatsApp: personal, like texting friends.
- Use the customer's own words for problems. Concrete beats clever.
- Never invent numbers, users, revenue, testimonials or features. If something isn't in the brand brain, leave it out.
- Never invent the founder's personal history ("I used to be a freelancer", "for years I..."). Write about the problem and why the product exists, not a made-up backstory.
- Never claim speed, timing, money amounts, savings or results ("instantly", "next day", "in minutes", "₦50k", "2x") unless the brand brain says exactly that. Describe what the product does, not outcomes you can't prove.
- Include the website only where it is natural (X last post, LinkedIn end, WhatsApp). Not in the Reddit title.
- No hashtag spam (at most 2 on X/LinkedIn), no "game-changer", "revolutionary", "excited to announce".`;

export const launchPostsPrompt = (b: BrandContext) => `${brandBlock(b)}\n\nWrite the launch posts.`;

export function mockLaunchPosts(b: BrandContext): LaunchPosts {
  const n = b.name;
  return {
    x_thread: [`I built ${n}. (Sample post: add ANTHROPIC_API_KEY for real copy.)`, `${b.pain_points[0] ?? 'The problem'} was eating my week.`, `So ${n} does it for you.`, `Try it: ${b.url ?? n}`],
    linkedin: `For months I struggled with this.\n\nSo I built ${n}. (Sample post.)`,
    reddit: { title: `I built ${n} to fix a problem I had (sample)`, body: `Sample body for ${n}.`, subreddits: ['SideProject', 'startups'] },
    product_hunt: { tagline: `${n}, the simple way`, description: `${n} sample description.`, first_comment: `Hi Product Hunt, sample maker comment for ${n}.` },
    whatsapp: { status: `${n} is live (sample)`, broadcast: `Hey! I just launched ${n}. (Sample.)` },
  };
}

// ---------------------------------------------------------------- 30-day plan
export const LAUNCH_PLAN_VERSION = 'launch_plan@1';

/** Assets the plan can point at, so a task links to the draft that completes it. */
export const ASSET_REFS = ['x_thread', 'linkedin', 'reddit', 'product_hunt', 'whatsapp', 'posters', 'waitlist_page', 'readiness', 'directories', 'none'] as const;

export const LaunchPlanSchema = z.object({
  tasks: z.array(z.object({
    day: z.number().describe('Days relative to launch day: -14 to +15. Launch day is 0.'),
    title: z.string().describe('The action, imperative, under 70 characters'),
    why: z.string().describe('One sentence on why it matters'),
    channel: z.string().describe('x, linkedin, reddit, product_hunt, whatsapp, email, hn, indiehackers, directories, site, or other'),
    asset_ref: z.enum(ASSET_REFS).describe('Which ready-made asset completes this task, or none'),
  })).describe('22-30 tasks spread from day -14 to day +15, most days have one task, launch week is busiest'),
});
export type LaunchPlan = z.infer<typeof LaunchPlanSchema>;

export const LAUNCH_PLAN_SYSTEM = `You plan a solo founder's 30-day launch, from 14 days before launch day to 15 days after. The founder has little time, so every task must be small, specific and doable in under 30 minutes.

Rules:
- Order: get the site ready (readiness check, waitlist page), warm up the audience (build in public, replies, network), launch day (Product Hunt, X thread, LinkedIn, WhatsApp, Show HN when it fits, Reddit), then follow-up (directories, thank-yous, sharing early results, asking for feedback).
- Link a task to an asset_ref when one of the ready-made assets completes it. Use "none" otherwise.
- Pick channels that fit this product's customer. Skip channels that clearly don't fit.
- Never promise results. No invented numbers.`;

export const launchPlanPrompt = (b: BrandContext) => `${brandBlock(b)}\n\nPlan the 30 days around launch day.`;

export function mockLaunchPlan(): LaunchPlan {
  const t = (day: number, title: string, channel: string, asset_ref: (typeof ASSET_REFS)[number]) => ({ day, title, why: 'Sample task (add ANTHROPIC_API_KEY for a real plan).', channel, asset_ref });
  return {
    tasks: [
      t(-14, 'Run the launch readiness check', 'site', 'readiness'), t(-13, 'Publish your waitlist page', 'site', 'waitlist_page'),
      t(-10, 'Share the waitlist with friends on WhatsApp', 'whatsapp', 'whatsapp'), t(-7, 'Post the countdown poster', 'x', 'posters'),
      t(0, 'Post the launch thread on X', 'x', 'x_thread'), t(0, 'Launch on Product Hunt', 'product_hunt', 'product_hunt'),
      t(0, 'Post your founder story on LinkedIn', 'linkedin', 'linkedin'), t(1, 'Share on Reddit', 'reddit', 'reddit'),
      t(3, 'Submit to 5 directories', 'directories', 'directories'), t(10, 'Thank everyone who signed up', 'email', 'none'),
    ],
  };
}
