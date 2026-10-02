// Claim checker (PRD section 15: FTC / UK ASA). Flags numbers, money and outcome words in a draft that the
// brand brain doesn't back up. Flagged drafts always need the founder; trust mode never auto-approves them.
const OUTCOME_WORDS = [
  'instantly', 'instant', 'guaranteed', 'guarantee', 'overnight', 'next day', 'same day', 'in minutes', 'in seconds',
  '#1', 'number one', 'best in', 'fastest', 'cheapest', 'risk-free', 'no risk', '100%', 'proven', 'thousands of', 'millions of',
];

/** Returns human-readable flags for unsupported claims in `text`, given the facts we know (brand brain text). */
export function findUnsupportedClaims(text: string, facts: string): string[] {
  const t = text.toLowerCase();
  const f = facts.toLowerCase();
  const flags = new Set<string>();

  for (const w of OUTCOME_WORDS) {
    if (t.includes(w) && !f.includes(w)) flags.add(`Unverified claim: "${w}"`);
  }
  // Money amounts and multipliers (₦50k, $10, £5, 2x, 3×) that the facts don't mention.
  for (const m of text.matchAll(/(?:[₦$£€]\s?\d[\d,.]*\s?[kKmM]?|\b\d+(?:\.\d+)?\s?[x×]\b)/g)) {
    const v = m[0].replace(/\s/g, '').toLowerCase();
    if (!f.replace(/\s/g, '').includes(v)) flags.add(`Unverified number: "${m[0].trim()}"`);
  }
  // Percentages and user/customer counts.
  for (const m of text.matchAll(/\b\d[\d,.]*\s?(?:%|percent|users|customers|founders|freelancers|signups|people)\b/gi)) {
    if (!f.includes(m[0].toLowerCase())) flags.add(`Unverified number: "${m[0]}"`);
  }
  // Absolute claims nobody can back: "works every time", "every freelancer", "always works".
  for (const m of text.matchAll(/\b(works every time|always works|never fails|every (?:single )?(?:freelancer|user|customer|founder|business|client)s?(?: we know)?|everyone loves|no one else)\b/gi)) {
    flags.add(`Absolute claim: "${m[0]}"`);
  }
  // Before/after results ("from 30 days to 7") need a real source.
  for (const m of text.matchAll(/\bfrom\s+\d[\d,.]*\s*(?:days?|hours?|weeks?|minutes?|%|x)?\s+to\s+\d[\d,.]*\b/gi)) {
    if (!f.includes(m[0].toLowerCase())) flags.add(`Unverified result: "${m[0]}"`);
  }
  // Promises about the roadmap must be real plans.
  if (/(?:^|\n|\.\s+)next:|\bcoming soon\b|\bwe'?re (?:now )?(?:building|adding|working on)\b|\bsoon you'?ll\b/i.test(text) && !/coming soon|next:/.test(f)) {
    flags.add('Mentions a future plan: confirm it\'s real');
  }
  // Security and privacy promises need to be true of the product.
  for (const m of text.matchAll(/\b(encrypted|encryption|bank[- ]level|bank[- ]grade|secure|securely|gdpr[- ]compliant|pci[- ]compliant|soc ?2)\b/gi)) {
    if (!f.includes(m[0].toLowerCase())) { flags.add(`Security claim: "${m[0]}". Check it's accurate`); break; }
  }
  // Outcomes about other people ("most freelancers who try it stay").
  for (const m of text.matchAll(/\bmost (?:[\w-]+ ){0,4}who (?:try|use|switch|join)[^.!?]{0,40}/gi)) flags.add(`Unverified outcome: "${m[0].trim()}"`);
  // Pricing promises must match real pricing.
  for (const m of text.matchAll(/\b(free to try|free trial|free plan|free forever|no credit card|only pay when|money[- ]back|cancel anytime|is free)\b/gi)) {
    if (!f.includes(m[0].toLowerCase()) && !/\bfree\b/.test(f)) flags.add(`Pricing claim: "${m[0]}". Make sure it matches your real pricing`);
  }
  // Stories about users or past events must be real; the founder confirms them.
  if (/\b(?:a|one of our|our|my|some)\s+(?:beta\s+)?(?:users?|customers?|clients?|testers?)\s+(?:asked|told|said|wrote|messaged|requested|kept|wanted|emailed)\b/i.test(text)) {
    flags.add('A story about a user: confirm it really happened');
  }
  return [...flags];
}
