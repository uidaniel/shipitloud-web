export const site = {
  name: 'ShipItLoud',
  tagline: 'You built it. Ship it loud.',
  description: 'Paste your product. Get a launch kit, a 30-day plan and your first users.',
  // NEXT_PUBLIC_SITE_URL wins; otherwise the host's own production URL (Netlify sets URL, Vercel sets
  // VERCEL_PROJECT_PRODUCTION_URL). Localhost only in dev, so share previews never point at it.
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    (process.env.NODE_ENV === 'production' ? 'https://shipitloud.com' : 'http://localhost:3000')
  ).replace(/\/$/, ''),
  waitlistSlug: 'shipitloud',
  legalEntity: 'MOTX Studios',
  contactEmail: 'hello@shipitloud.com',
  // Self-launch test targets (PRD section 3): free setups, not waitlist signups. ShipItLoud has no waitlist of its own.
  goals: { setups: 200, setupDays: 30, paying: 20, payingDays: 60 },
  // The front door is "paste your URL → Start free" (10-minute setup). Optional prelaunch mode (PRD v5): set
  // NEXT_PUBLIC_LAUNCHED=0 to show "Launching [date]" with an "Email me when it's live" box instead.
  launch: {
    live: process.env.NEXT_PUBLIC_LAUNCHED !== '0',
    date: process.env.NEXT_PUBLIC_LAUNCH_DATE || null,   // YYYY-MM-DD
  },
  referralBoost: 5,
  // Stored with every signup as the record of what the person agreed to.
  consentText: 'Email me once when ShipItLoud is live.',
} as const;

export type Currency = 'USD' | 'GBP' | 'EUR';

export const currencies: Record<Currency, string> = { USD: '$', GBP: '£', EUR: '€' };

export interface PlanInfo {
  id: 'free' | 'launch_pass' | 'grow' | 'scale';
  name: string;
  price: Record<Currency, number>;
  period: 'one-time' | 'month' | null;
  summary: string;
  features: string[];
  featured?: boolean;
}

// PRD section 11: Grow is the hero ("Recommended"); Launch Pass is a smaller one-time option below the plans.
export const plans: PlanInfo[] = [
  {
    id: 'free',
    name: 'Free',
    price: { USD: 0, GBP: 0, EUR: 0 },
    period: null,
    summary: 'See what we’d do for your product.',
    features: ['10-minute setup: analysis, plan and first assets', '3 free first wins', 'Waitlist page with referrals', '5 posters a month', '3 warm leads a week'],
  },
  {
    id: 'grow',
    name: 'Grow',
    price: { USD: 49, GBP: 39, EUR: 45 },
    period: 'month',
    summary: 'Marketing that never stops.',
    features: ['Full launch kit in your first month', 'Listening + drafted replies', 'Content engine, SEO blog, UGC format remix', 'Reddit via Chrome extension', 'Email, comment-to-DM, weekly digest'],
    featured: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: { USD: 149, GBP: 119, EUR: 139 },
    period: 'month',
    summary: 'Put budget behind what works.',
    features: ['Everything in Grow', 'Ads autopilot with hard caps', 'X listening and Creator CRM', '12 videos, 200 images a month', 'Up to 3 products'],
  },
  {
    id: 'launch_pass',
    name: 'Launch Pass',
    price: { USD: 199, GBP: 159, EUR: 179 },
    period: 'one-time',
    summary: 'Just launching? One-time kit.',
    features: ['Full launch kit and 30-day plan', 'Demo video and launch posts', 'Launch support', 'Custom domain, no badge', 'First month of Grow free'],
  },
];

