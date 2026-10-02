// Landing page audit and network launch messages (PRD section 5 "Network launch", "Conversion fixes").
import { z } from 'zod';
import { brandBlock, type BrandContext } from './launch.ts';

export const PAGE_AUDIT_VERSION = 'page_audit@2';
export const NETWORK_VERSION = 'network_launch@1';

const Fix = z.object({
  problem: z.string().describe('One sentence: what is wrong, from a first-time visitor’s point of view'),
  quote: z.string().describe('The exact words on the page this is about, copied character for character. Empty string if it is about something missing.'),
  fix: z.string().describe('One or two sentences: what to change, concretely'),
  rewrite: z.string().describe('Only the replacement words themselves, ready to paste (a headline, a button label, a line of copy), never an instruction. Empty string when the fix is to add something only the founder has.'),
});
export const PageAuditSchema = z.object({ clarity: Fix, cta: Fix, trust: Fix });
export type PageAudit = z.infer<typeof PageAuditSchema>;

export const PAGE_AUDIT_SYSTEM = `You review a landing page the way a sharp, kind conversion expert would, and give the single most important fix in each of three areas:
- clarity: can a first-time visitor tell in five seconds what it is, who it's for and why it's better?
- cta: is there one obvious next step, and does the button say what happens?
- trust: is there a reason to believe it (proof, a real person behind it, pricing, privacy)?

Rules:
- Pick the fix that would change the most signups, not the easiest one. Use the detected issues as hints, but judge for yourself.
- When you point at existing text, copy it exactly into "quote". Don't paraphrase it.
- "rewrite" is the new text itself, not advice. It must only use facts from the brand block or the page. Never invent user counts, testimonials, logos, ratings, guarantees, results or timeframes ("in 30 days", "10x") the brand doesn't state. For trust, suggest what to add and how (e.g. "add one quote from a beta user"), not fake proof.
- Plain words, no marketing jargon, no em dashes.`;

export const pageAuditPrompt = (b: BrandContext, page: string, hints: string) =>
  `${brandBlock(b)}\n\nThe landing page, as text:\n"""\n${page}\n"""\n\nIssues our checks detected:\n${hints || '- none'}\n\nGive the top fix for clarity, for the call to action, and for trust.`;

export function mockPageAudit(h1: string, cta: string): PageAudit {
  return {
    clarity: { problem: 'Sample finding (mock mode): the headline could say more plainly what the product does.', quote: h1, fix: 'Say what it does and who it is for in the headline.', rewrite: '' },
    cta: { problem: 'Sample finding (mock mode): the main button could say what happens next.', quote: cta, fix: 'Name the outcome on the button.', rewrite: '' },
    trust: { problem: 'Sample finding (mock mode): there is little proof yet.', quote: '', fix: 'Add one short quote from an early user, with their name.', rewrite: '' },
  };
}

// ---------------------------------------------------------------- network launch
const Msg = z.string().describe('The message, plain text. Use {{name}} once for their first name and {{link}} once for the link.');
export const NetworkSchema = z.object({
  friends: Msg.describe('WhatsApp/SMS to friends and family: warm, 40-70 words, asks them to try it or pass it to one person who would use it'),
  professional: Msg.describe('LinkedIn message to a connection: polite, 50-80 words, why you thought of them specifically (left as a gap they fill in, written as [why them]), soft ask'),
  peers: Msg.describe('To founders, ex-colleagues or a community you are in: 40-70 words, asks for honest feedback and a share if they like it'),
  linkedin_post: z.string().describe('A LinkedIn post announcing it to your network, 80-150 words, first person, ends with {{link}}'),
});
export type NetworkMessages = z.infer<typeof NetworkSchema>;

export const NETWORK_SYSTEM = `You write the personal messages a founder sends to people they know on launch day. These go one by one from the founder's own phone or account, so they must sound like the founder, not a campaign.

Rules:
- First person, short, human. No "I'm thrilled to announce", no "game-changer", no hashtags in messages, no emoji, no em dashes.
- Only facts from the brand block. Never invent users, results, prices, discounts or dates.
- One clear ask per message. Make it easy to say no.
- Use {{name}} and {{link}} exactly as written.`;

export const networkPrompt = (b: BrandContext) => `${brandBlock(b)}\n\nWrite the four launch messages.`;

export const mockNetwork = (b: BrandContext): NetworkMessages => ({
  friends: `Hey {{name}}, sample message (mock mode). I just launched ${b.name}. Would you try it? {{link}}`,
  professional: `Hi {{name}}, sample message (mock mode). I thought of you because [why them]. Here it is: {{link}}`,
  peers: `Hey {{name}}, sample message (mock mode). I'd love your honest feedback on ${b.name}: {{link}}`,
  linkedin_post: `Sample post (mock mode). Today I'm opening ${b.name}. {{link}}`,
});
