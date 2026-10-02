// Pre-publish score (PRD section 16): 0-100 with the reasons, before anything goes out.
// Deterministic and explainable: every point lost comes with a fix the founder can apply.

export interface ScoreInput { platform: string; text: string; thread?: string[]; title?: string; flags?: string[] }
export interface ScoreResult { score: number; tips: string[] }

const LIMITS: Record<string, { min: number; max: number; hook: number }> = {
  x: { min: 40, max: 280, hook: 110 },
  linkedin: { min: 400, max: 1600, hook: 150 },
  whatsapp: { min: 20, max: 700, hook: 120 },
  reddit: { min: 150, max: 3000, hook: 300 },
  bluesky: { min: 40, max: 300, hook: 110 },
  instagram: { min: 40, max: 2200, hook: 125 },
  tiktok: { min: 20, max: 2200, hook: 100 },
};
const WEAK_OPENERS = /^(excited to|i'?m (so )?(thrilled|excited|happy) to|thrilled to|hey (everyone|guys|folks)|in today'?s (world|fast)|did you know|big news|we are pleased|announcing)/i;
const BUZZ = /\b(game[- ]changer|revolutioni[sz]e|unlock(ing)? the|leverag(e|ing)|seamless(ly)?|elevate|delve|supercharge|cutting[- ]edge|next[- ]level|in the realm of|harness the power)\b/gi;

export function publishScore(input: ScoreInput): ScoreResult {
  const tips: string[] = [];
  let score = 100;
  const lose = (n: number, tip: string) => { score -= n; tips.push(tip); };
  const lim = LIMITS[input.platform] ?? { min: 20, max: 3000, hook: 140 };
  const parts = input.thread?.length ? input.thread : [input.text];
  const text = parts.join('\n\n');
  // The hook is the first sentence of the first line (single-line posts have no line breaks).
  const firstLine = (input.title || parts[0] || '').trim().split('\n')[0] ?? '';
  const first = firstLine.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? firstLine;

  // Length for the platform
  if (input.platform === 'x' && parts.some((p) => p.length > 280)) lose(25, 'One post is over 280 characters. Split it or cut it down.');
  else if (input.platform !== 'x' && text.length > lim.max) lose(15, `It's long for ${input.platform}. Aim for under ${lim.max} characters.`);
  if (text.trim().length < lim.min) lose(10, `It's very short for ${input.platform}. Add one concrete detail.`);

  // Hook
  if (first.length > lim.hook) lose(10, 'The first line is long. Make the hook one short sentence.');
  if (WEAK_OPENERS.test(first)) lose(15, 'Starts with a generic opener. Lead with the problem, a number or the result.');

  // Things that make posts look automated
  const buzz = new Set((text.match(BUZZ) ?? []).map((w) => w.toLowerCase()));
  if (buzz.size) lose(Math.min(15, buzz.size * 5), `Sounds like marketing copy (${[...buzz].slice(0, 3).join(', ')}). Use plain words.`);
  const dashes = (text.match(/—/g) ?? []).length;
  if (dashes >= 2) lose(5, 'Several em dashes read as AI-written. Use full stops or commas.');
  const hashtags = (text.match(/(^|\s)#\w+/g) ?? []).length;
  if (hashtags > (input.platform === 'linkedin' || input.platform === 'instagram' ? 5 : 2)) lose(10, 'Too many hashtags. Keep one or two at most.');
  const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emoji > 3) lose(5, 'Lots of emoji. One or none reads better.');

  // Readability
  if (input.platform === 'linkedin' && text.split(/\n\s*\n/).some((p) => p.length > 450)) lose(10, 'There\'s a wall of text. Break it into short paragraphs.');
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim());
  const avg = sentences.reduce((a, s) => a + s.split(/\s+/).length, 0) / Math.max(1, sentences.length);
  if (avg > 28) lose(5, 'Sentences are long. Shorter ones are easier to read on a phone.');

  // Claims the brand brain can't back (from the claim checker)
  const flags = input.flags ?? [];
  if (flags.length) lose(Math.min(30, flags.length * 15), `Check these claims before posting: ${flags.slice(0, 2).join('; ')}.`);

  return { score: Math.max(0, Math.min(100, Math.round(score))), tips };
}
