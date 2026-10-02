// One real brand-brain call (about $0.01) to prove the pipeline. Cleans up after itself.
import '../src/env.ts';
import { db } from '../src/db.ts';
import { buildBrand } from '../src/brand.ts';

const { data: ws } = await db.from('workspaces').insert({ product_name: 'Balans', url: 'https://balans.ng' }).select('id').single();
try {
  await buildBrand(ws!.id);
  const { data: b } = await db.from('brand_brains').select('*').eq('workspace_id', ws!.id).single();
  const { data: v } = await db.from('voice_profiles').select('tone, style_notes, dos, donts').eq('workspace_id', ws!.id).single();
  const { data: k } = await db.from('brand_kits').select('logo_url, palette, fonts').eq('workspace_id', ws!.id).single();
  const { data: c } = await db.from('ai_calls').select('model, input_tokens, output_tokens, cost_usd').eq('workspace_id', ws!.id);
  console.log(JSON.stringify({ status: b.status, error: b.error, one_liner: b.one_liner, category: b.category, target_customer: b.target_customer, pain_points: b.pain_points, keywords: b.keywords, competitors: b.competitors, content_pillars: b.content_pillars, confidence: b.confidence, voice: v, kit: k }, null, 2));
  console.log('AI calls:', JSON.stringify(c));
} finally {
  await db.from('workspaces').delete().eq('id', ws!.id);
}
