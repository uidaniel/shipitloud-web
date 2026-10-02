// One real AI call for the demo video script, using Balans-like brand facts and real homepage headings. ~$0.002.
import '../src/env.ts';
import { VIDEO_SCRIPT_SYSTEM, VIDEO_SCRIPT_VERSION, VideoScriptSchema, fastModel, findUnsupportedClaims, generate, mockVideoScript, videoScriptPrompt, type BrandContext } from '@shipitloud/ai';
import { aiLedger } from '../src/db.ts';

const b: BrandContext = {
  name: 'Balans', url: 'https://balans.ng', launch_date: null,
  one_liner: 'Invoice from WhatsApp, get paid to your bank', target_customer: 'Freelancers and small businesses in Nigeria',
  pain_points: ['Chasing clients for payment', 'Making invoices by hand'], competitors: [], keywords: [], tone: 'casual, practical', dos: [], donts: [],
};
const shots = [
  { headings: ['Invoice from WhatsApp. Get paid to your bank.'] },
  { headings: ['Your client just opens a link.', 'Paid straight to you', 'Deposits, if you asked for one'] },
  { headings: ["Type it the way you'd say it.", "Check it, tap Send it. That's the whole job."] },
];
const r = await generate({ ledger: aiLedger, purpose: 'video_script', promptVersion: VIDEO_SCRIPT_VERSION, workspaceId: null, model: fastModel(), system: VIDEO_SCRIPT_SYSTEM, user: videoScriptPrompt(b, shots, false), schema: VideoScriptSchema, maxTokens: 500, mock: () => mockVideoScript(b, 3, false) });
console.log(JSON.stringify(r.data, null, 2));
console.log('flags', findUnsupportedClaims([r.data.hook, ...r.data.captions, r.data.cta].join(' '), [b.one_liner, b.target_customer, ...b.pain_points].join(' ')));
console.log('cost', r.costUsd ?? r);
