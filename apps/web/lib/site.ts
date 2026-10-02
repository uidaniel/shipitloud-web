export const site = {
  name: 'ShipItLoud',
  tagline: 'You built it. Ship it loud.',
  description: 'Paste your product. Get a launch kit, a 30-day plan and your first users.',
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  waitlistSlug: 'shipitloud',
  legalEntity: 'MOTX Studios',
  contactEmail: 'hello@shipitloud.com',
  // Self-launch test targets from the PRD (section 3).
  goals: { signups: 200, signupDays: 30, paying: 20, payingDays: 60 },
  referralBoost: 5,
  // Stored with every signup as the record of what the person agreed to.
  consentText: 'Email me about the ShipItLoud launch and early access. Unsubscribe any time.',
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

// PRD section 14 price list and caps.
export const plans: PlanInfo[] = [
  {
    id: 'free',
    name: 'Free',
    price: { USD: 0, GBP: 0, EUR: 0 },
    period: null,
    summary: 'A waitlist that grows itself.',
    features: ['One waitlist page', 'Referral system', '5 posters a month', 'ShipItLoud badge'],
  },
  {
    id: 'launch_pass',
    name: 'Launch Pass',
    price: { USD: 199, GBP: 159, EUR: 179 },
    period: 'one-time',
    summary: 'Everything for launch day.',
    features: ['Full launch kit', '3 demo videos', '60 images, 100 AI drafts', '30-day launch plan', 'Custom domain, no badge', 'First month of Grow free'],
    featured: true,
  },
  {
    id: 'grow',
    name: 'Grow',
    price: { USD: 49, GBP: 39, EUR: 45 },
    period: 'month',
    summary: 'Marketing that keeps running.',
    features: ['Listening + drafted replies', 'Content engine + SEO blog', 'Reddit via Chrome extension', '4 videos, 60 images a month', 'Weekly digest'],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: { USD: 149, GBP: 119, EUR: 139 },
    period: 'month',
    summary: 'Put budget behind what works.',
    features: ['Everything in Grow', 'Ads autopilot with hard caps', 'X listening', '12 videos, 200 images a month', 'Up to 3 products'],
  },
];
