// Real keyword ideas and one real article (a competitor comparison, the riskiest kind) for review. Cleans up.
// Cost: about $0.02. Run: npx tsx scripts/smoke-blog.ts
import '../src/env.ts';
import { db } from '../src/db.ts';
import { findKeywords, writeArticle } from '../src/blog.ts';

const { data: u } = await db.auth.admin.createUser({ email: `blog+${Date.now()}@shipitloud.test`, password: `Pw-${Date.now()}-x`, email_confirm: true });
const { data: ws } = await db.from('workspaces').insert({ owner_id: u.user!.id, product_name: 'Balans', url: 'https://balans.ng', plan: 'grow' }).select('id').single();
const id = ws!.id;
try {
  await db.from('brand_brains').insert({
    workspace_id: id, status: 'ready', one_liner: 'Invoice from WhatsApp, get paid to your bank', target_customer: 'Freelancers and small businesses in Nigeria',
    pain_points: ['Chasing clients for payment', 'Making invoices by hand'], keywords: ['whatsapp invoice', 'invoice app nigeria'], competitors: ['Wave', 'Zoho Invoice'],
    summary: 'Balans lets freelancers type a job and amount in WhatsApp; Balans makes the invoice and the client pays by bank transfer from a link. No app or account for the client. Deposits can be requested up front.',
  });
  await db.from('voice_profiles').insert({ workspace_id: id, tone: 'casual, practical' });
  await db.from('brand_kits').insert({ workspace_id: id });

  const n = await findKeywords(id);
  const { data: ks } = await db.from('seo_keywords').select('id, keyword, kind, source, priority, why').eq('workspace_id', id).order('priority', { ascending: false });
  console.log(`\n${n} keyword ideas:`);
  for (const k of ks ?? []) console.log(`  [${String(k.priority).padStart(3)}] ${k.kind.padEnd(11)} ${k.keyword}  · ${k.why}`);

  const target = (ks ?? []).find((k) => k.kind === 'alternative') ?? ks![0]!;
  const postId = await writeArticle(id, target.id);
  const { data: p } = await db.from('blog_posts').select('title, slug, meta, body, faq, seo_score, seo_tips').eq('id', postId).single();
  const { data: a } = await db.from('assets').select('flags, status').eq('workspace_id', id).eq('type', 'article').single();
  console.log(`\n==== ${p!.title}  (/${p!.slug})\nmeta: ${JSON.stringify(p!.meta)}\nSEO ${p!.seo_score}: ${p!.seo_tips.join(' | ')}\nflags: ${JSON.stringify(a!.flags)}\n`);
  console.log(p!.body);
  console.log('\nFAQ:', JSON.stringify(p!.faq, null, 1));
  const { data: cost } = await db.from('ai_calls').select('purpose, model, cost_usd').eq('workspace_id', id);
  console.log('cost', cost?.map((c) => `${c.purpose} (${c.model}) $${Number(c.cost_usd).toFixed(4)}`).join(', '));
} finally {
  await db.from('jobs').delete().eq('workspace_id', id);
  await db.from('workspaces').delete().eq('id', id);
  await db.auth.admin.deleteUser(u.user!.id);
}
