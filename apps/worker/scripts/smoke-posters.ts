// One real poster-copy call (about $0.005) for Balans, renders, uploads, then cleans up everything.
import '../src/env.ts';
import { writeFileSync } from 'node:fs';
import { db } from '../src/db.ts';
import { makePosters } from '../src/posters.ts';

const out = process.argv[2];
const { data: ws } = await db.from('workspaces').insert({ product_name: 'Balans', url: 'https://balans.ng', plan: 'launch_pass' }).select('id').single();
const id = ws!.id as string;
try {
  await db.from('brand_brains').insert({
    workspace_id: id, status: 'ready',
    one_liner: 'Invoice from WhatsApp, get paid straight to your bank',
    target_customer: 'Freelancers and small businesses in Nigeria who bill clients and chase payments.',
    pain_points: ['I chase clients to pay me every month', 'My clients don’t want to install another app', 'I lose time formatting invoices'],
  });
  await db.from('voice_profiles').insert({ workspace_id: id, tone: 'casual, practical, a bit cheeky, local' });
  await db.from('brand_kits').insert({ workspace_id: id, logo_url: 'https://balans.ng/apple-icon.png', palette: ['#10231C'] });

  const r = await makePosters(id);
  console.log('result', r);
  const { data: assets } = await db.from('assets').select('title, file_url, qa_score, content').eq('workspace_id', id);
  for (const [i, a] of (assets ?? []).entries()) {
    console.log(`- ${a.title} | QA ${a.qa_score} | ${JSON.stringify((a.content as { slots: object }).slots)}`);
    if (out) writeFileSync(`${out}/real-${i}.png`, Buffer.from(await (await fetch(a.file_url)).arrayBuffer()));
  }
  const { data: c } = await db.from('ai_calls').select('model, input_tokens, output_tokens, cost_usd').eq('workspace_id', id);
  console.log('AI calls:', JSON.stringify(c));
  console.log('Month to date:', (await db.rpc('ai_spend_this_month')).data);
} finally {
  const { data: files } = await db.storage.from('assets').list(`${id}/posters`);
  if (files?.length) await db.storage.from('assets').remove(files.map((f) => `${id}/posters/${f.name}`));
  await db.from('jobs').delete().eq('workspace_id', id);
  await db.from('workspaces').delete().eq('id', id);
}
