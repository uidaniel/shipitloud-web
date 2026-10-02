// Emails to the waitlist (PRD section 5 "Waitlist email sequence", section 6 "Email"): written by the founder,
// approved in the inbox, sent through Resend with unsubscribe and the business address added automatically.
import { z } from 'zod';
import { brandBlock, type BrandContext } from './launch.ts';

export const WAITLIST_EMAILS_VERSION = 'waitlist_emails@1';
export const BROADCAST_VERSION = 'broadcast@1';

const Email = z.object({
  subject: z.string().describe('Under 60 characters, plain, no clickbait, no emoji'),
  body: z.string().describe('Plain text, 50-150 words, short paragraphs separated by blank lines, signed with the founder first name if known'),
  cta_label: z.string().describe('2-4 word button label'),
});

export const WaitlistEmailsSchema = z.object({
  welcome: Email.describe('Right after signup: thanks, what they signed up for, their place ({{position}}) and their share link ({{referral_link}}) to move up'),
  referral_nudge: Email.describe('Two days later, if they have not referred anyone: a friendly nudge with {{referral_link}}, and one reason a friend would care'),
  countdown: Email.describe('Sent the day before launch, whenever that is: say it opens tomorrow (never a number of days or weeks), and what they will be able to do. No promises about early access unless the brand block says so.'),
  launch_day: Email.describe('Launch day: it is live, how to start'),
});
export type WaitlistEmails = z.infer<typeof WaitlistEmailsSchema>;

const RULES = `Rules:
- Write as the founder, first person, like a short personal email, not a newsletter. No "Dear valued customer".
- Placeholders you may use exactly as written: {{product}}, {{product_url}} (the product itself), {{position}}, {{referral_link}} (their share link), {{status_link}} (their place on the waitlist).
- Never invent numbers, features, prices, dates, other users or results. Only use facts from the brand block.
- No fake urgency or scarcity ("only 3 spots left", "last chance"), no ALL CAPS, no emoji, no em dashes.
- Don't add an unsubscribe line or address; they are added automatically.`;

export const WAITLIST_EMAILS_SYSTEM = `You write the four emails a founder sends to their waitlist.\n\n${RULES}`;
export const waitlistEmailsPrompt = (b: BrandContext) => `${brandBlock(b)}\n\nWrite the four waitlist emails.`;

export function mockWaitlistEmails(b: BrandContext): WaitlistEmails {
  const e = (subject: string, body: string, cta: string) => ({ subject, body, cta_label: cta });
  return {
    welcome: e(`You're on the ${b.name} list`, `Thanks for joining (sample, mock mode). You're #{{position}}.\n\nShare your link to move up: {{referral_link}}`, 'Share your link'),
    referral_nudge: e('Move up the list', 'Sample nudge (mock mode). Know someone who would want {{product}}? Send them {{referral_link}}.', 'Share your link'),
    countdown: e(`${b.name} opens tomorrow`, 'Sample countdown (mock mode). Tomorrow you can start.', 'See your place'),
    launch_day: e(`${b.name} is live`, 'Sample launch email (mock mode). It is live today.', `Try ${b.name}`),
  };
}

export const BroadcastSchema = Email;
export type Broadcast = z.infer<typeof BroadcastSchema>;
export const BROADCAST_SYSTEM = `You write one email from a founder to everyone on their waitlist, about one thing.\n\n${RULES}`;
export const broadcastPrompt = (b: BrandContext, topic: string) => `${brandBlock(b)}\n\nWhat this email is about: ${topic}\n\nWrite it.`;
export const mockBroadcast = (b: BrandContext, topic: string): Broadcast => ({ subject: `News from ${b.name}`, body: `Sample email (mock mode) about: ${topic}`, cta_label: `Open ${b.name}` });

// ---------------------------------------------------------------- lifecycle (the founder's own users)
export const LIFECYCLE_EMAILS_VERSION = 'lifecycle_emails@2';
export const WINBACK_VERSION = 'winback@1';

export const LifecycleEmailsSchema = z.object({
  welcome: Email.describe('Right after someone signs up for the product: thanks, the one first thing to do to get value, offer to reply with questions'),
  activation_nudge: Email.describe('Two days in, they have not done the key first step yet: name it, why it matters, how to do it in one or two steps'),
  trial_ending: Email.describe('Their trial ends in a few days (say "soon" or "in a few days", never a number): what they keep by upgrading, no pressure. Never say what happens when the trial ends (account keeps working, data kept or deleted, features locked) unless the brand block says so.'),
  upgrade_offer: Email.describe('Active on the free plan for a week: what paid unlocks, from the brand facts only. If the brand block names no paid features, don’t guess: invite them to see the plans.'),
});
export type LifecycleEmails = z.infer<typeof LifecycleEmailsSchema>;

const LIFECYCLE_RULES = `${RULES.replace('- Placeholders you may use exactly as written: {{product}}, {{product_url}} (the product itself), {{position}}, {{referral_link}} (their share link), {{status_link}} (their place on the waitlist).', '- Placeholders you may use exactly as written: {{name}} (their first name, may be empty, so write "Hi {{name}}," only as the greeting), {{product}}, {{product_url}}, {{upgrade_url}}.')}
- These go to people who already use the product, so be useful first. Never invent discounts, prices or deadlines.`;

export const LIFECYCLE_SYSTEM = `You write the four onboarding emails a founder sends to people who signed up for their product.\n\n${LIFECYCLE_RULES}`;
export const lifecyclePrompt = (b: BrandContext, activation: string) => `${brandBlock(b)}\n\nThe key first step that means a user got value (the event "${activation}"): describe it from the product facts; if unclear, call it "your first ${b.name} result" without inventing features.\n\nWrite the four emails.`;

export function mockLifecycleEmails(b: BrandContext): LifecycleEmails {
  const e = (subject: string, body: string, cta: string) => ({ subject, body, cta_label: cta });
  return {
    welcome: e(`Welcome to ${b.name}`, 'Hi {{name}},\n\nSample welcome (mock mode). Reply if you get stuck.', `Open ${b.name}`),
    activation_nudge: e('One step to your first result', 'Hi {{name}},\n\nSample nudge (mock mode).', 'Do it now'),
    trial_ending: e('Your trial ends soon', 'Hi {{name}},\n\nSample trial email (mock mode).', 'Keep my account'),
    upgrade_offer: e(`What paid ${b.name} adds`, 'Hi {{name}},\n\nSample upgrade email (mock mode).', 'See plans'),
  };
}

export const WinbackSchema = Email;
export const WINBACK_SYSTEM = `You write a short personal email from a founder to a paying customer who has gone quiet. The goal is to learn why and help, not to sell.\n\n${LIFECYCLE_RULES}\n- 40-90 words. Ask one simple question they can answer in a line. No guilt, no "we miss you", no offers.`;
export const winbackPrompt = (b: BrandContext) => `${brandBlock(b)}\n\nWrite the email.`;
export const mockWinback = (b: BrandContext) => ({ subject: `Quick question about ${b.name}`, body: 'Hi {{name}},\n\nSample win-back (mock mode). Is anything getting in the way?', cta_label: `Open ${b.name}` });
