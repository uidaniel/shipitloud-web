// Real searches, no DB, no AI: shows what each source returns and how the free score ranks it.
import { domainWords, heuristicScore, queriesFor, topicMatch } from '../src/listen.ts';
import { searchBluesky, searchGitHub, searchHN, type Found } from '../src/sources.ts';

const preset = process.argv[2] ?? 'balans';
const P = {
  balans: { keywords: ['invoice app', 'invoicing tool', 'chasing clients for payment', 'freelancer invoice'], competitors: ['FreshBooks', 'Wave'], pain_points: ['Chasing clients for payment', 'Making invoices by hand'], one_liner: 'Invoice from WhatsApp, get paid to your bank', brandKeywords: ['whatsapp invoice', 'invoice generator'] },
  shipitloud: { keywords: ['first users', 'marketing my saas', 'launch my product', 'solo founder marketing'], competitors: ['Taplio', 'ReplyGuy'], pain_points: ['Building is easy but getting users is hard', 'No time for marketing'], one_liner: 'An AI marketing co-founder that launches and grows your product', brandKeywords: ['launch marketing', 'indie hacker marketing'] },
}[preset]!;
const since = new Date(Date.now() - 30 * 86_400_000);
const domain = domainWords({ one_liner: P.one_liner, pain_points: P.pain_points, keywords: P.brandKeywords }, P);
console.log('domain words:', [...domain].join(', '));
const all: (Found & { q: string; h: number })[] = [];
let dropped = 0;
for (const q of queriesFor(P)) {
  const [hn, bs, gh] = await Promise.all([searchHN(q, since), searchBluesky(q, since), process.argv[3] === 'gh' ? searchGitHub(q, since) : []]);
  console.log(`${q.padEnd(30)} hn ${hn.length}  bsky ${bs.length}  gh ${gh.length}`);
  for (const f of [...hn, ...bs, ...gh]) { const t = topicMatch(f, P, domain); if (!t) { dropped++; continue; } all.push({ ...f, q: t.term, h: heuristicScore(f, P, t) }); }
}
const uniq = [...new Map(all.map((f) => [`${f.source}:${f.external_id}`, f])).values()].sort((a, b) => b.h - a.h);
const buckets = [0, 25, 40, 60, 80].map((t, i, a) => `${t}+: ${uniq.filter((f) => f.h >= t && f.h < (a[i + 1] ?? 101)).length}`);
console.log(`\n${uniq.length} unique · ${buckets.join(' · ')}\n`);
const show = (f: (typeof uniq)[0]) => console.log(`[${f.h}] ${f.source} q="${f.q}" ${(f.title ? f.title + ' — ' : '') + f.text.replace(/\s+/g, ' ').slice(0, 170)}`);
console.log('--- top 15'); uniq.slice(0, 15).forEach(show);
console.log('--- around the cut (25-39)'); uniq.filter((f) => f.h >= 25 && f.h < 40).slice(0, 6).forEach(show);


// With "ai" as the third arg: one real scoring batch on the top 15 (about $0.003) to check calibration.
if (process.argv.includes('ai')) {
  await import('../src/env.ts');
  const { LISTEN_SCORE_SYSTEM, LISTEN_SCORE_VERSION, ScoreSchema, fastModel, generate, mockScores, scorePrompt } = await import('@shipitloud/ai');
  const { aiLedger } = await import('../src/db.ts');
  const top = uniq.slice(0, 15);
  const items = top.map((f, i) => ({ id: `p${i + 1}`, source: f.source, title: f.title, text: f.text }));
  const b = { name: preset === 'balans' ? 'Balans' : 'ShipItLoud', url: null, one_liner: P.one_liner, target_customer: preset === 'balans' ? 'Freelancers and small businesses in Nigeria' : 'Solo technical founders', pain_points: P.pain_points, competitors: P.competitors, keywords: P.brandKeywords, tone: null, dos: [], donts: [], launch_date: null };
  const r = await generate({ ledger: aiLedger, purpose: 'listen_score', promptVersion: LISTEN_SCORE_VERSION, workspaceId: null, model: fastModel(), system: LISTEN_SCORE_SYSTEM, user: scorePrompt(b, items), schema: ScoreSchema, maxTokens: 120 + items.length * 45, mock: () => mockScores(items) });
  console.log('\n--- AI scores (free score → AI score)');
  for (const s of r.data.items) { const f = top[Number(s.id.slice(1)) - 1]!; console.log(`${String(f.h).padStart(3)} → ${String(s.relevance).padStart(3)} ${s.intent.padEnd(18)} ${s.reason} | ${(f.title ?? f.text).replace(/\s+/g, ' ').slice(0, 80)}`); }
  console.log('cost', r.costUsd);
}

// With "reply": one real reply draft for the top post (about $0.001).
if (process.argv.includes('reply')) {
  await import('../src/env.ts');
  const { LISTEN_REPLY_SYSTEM, LISTEN_REPLY_VERSION, ReplySchema, fastModel, generate, mockReply, replyPrompt, findUnsupportedClaims } = await import('@shipitloud/ai');
  const { aiLedger } = await import('../src/db.ts');
  const f = uniq[0]!;
  const b = { name: 'ShipItLoud', url: 'https://shipitloud.netlify.app', one_liner: P.one_liner, target_customer: 'Solo technical founders', pain_points: P.pain_points, competitors: P.competitors, keywords: P.brandKeywords, tone: 'plain, direct, a bit dry', dos: [], donts: [], launch_date: null };
  const r = await generate({ ledger: aiLedger, purpose: 'listen_reply', promptVersion: LISTEN_REPLY_VERSION, workspaceId: null, model: fastModel(), system: LISTEN_REPLY_SYSTEM, user: replyPrompt(b, f), schema: ReplySchema, maxTokens: 400, mock: () => mockReply(b) });
  console.log(`\n--- reply to: ${f.title ?? ''} ${f.text.slice(0, 200)}\n\n${r.data.reply}\n\nmentions product: ${r.data.mentions_product} · flags: ${JSON.stringify(findUnsupportedClaims(r.data.reply, P.one_liner + ' ' + P.pain_points.join(' ')))} · cost ${r.costUsd}`);
}
