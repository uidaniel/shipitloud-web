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
