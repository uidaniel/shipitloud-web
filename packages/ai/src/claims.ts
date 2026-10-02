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
  return [...flags];
}
