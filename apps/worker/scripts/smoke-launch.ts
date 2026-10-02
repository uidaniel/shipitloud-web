// One real launch-posts + plan run for Balans. Cleans up after itself.
import '../src/env.ts';
import { db } from '../src/db.ts';
import { makeLaunchPlan, makeLaunchPosts } from '../src/launch.ts';

const launch = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const { data: ws } = await db.from('workspaces').insert({ product_name: 'Balans', url: 'https://balans.ng', plan: 'launch_pass', launch_date: launch }).select('id').single();
const id = ws!.id as string;
try {
  await db.from('brand_brains').insert({
    workspace_id: id, status: 'ready',
    one_liner: 'Invoice from WhatsApp, get paid straight to your bank',
    target_customer: 'Freelancers and small businesses in Nigeria who bill clients and chase payments.',
    pain_points: ['I chase clients to pay me every month', 'My clients don’t want to install another app', 'I lose time formatting invoices'],
    competitors: ['Paystack invoicing', 'Spreadsheets and email'], keywords: ['invoice from WhatsApp', 'freelancer payment Nigeria'],
  });
  await db.from('voice_profiles').insert({ workspace_id: id, tone: 'casual, practical, a bit cheeky, local', dos: ['Use naira amounts and Nigerian context'], donts: ['Corporate jargon'] });
  console.log('posts:', await makeLaunchPosts(id));
  console.log('tasks:', await makeLaunchPlan(id));
  const { data: assets } = await db.from('assets').select('title, scheduled_for, content').eq('workspace_id', id);
  for (const a of assets ?? []) console.log(`\n### ${a.title} @ ${a.scheduled_for}\n${(a.content as { text: string }).text}`);
  const { data: plan } = await db.from('launch_plans').select('tasks').eq('workspace_id', id).single();
  console.log('\n### PLAN');
  for (const t of plan!.tasks as { day: number; title: string; channel: string; asset_id: string | null }[]) console.log(`D${t.day >= 0 ? '+' : ''}${t.day}  ${t.title}  [${t.channel}]${t.asset_id ? '  (linked)' : ''}`);
  const { data: c } = await db.from('ai_calls').select('purpose, input_tokens, output_tokens, cost_usd').eq('workspace_id', id);
  console.log('\nAI calls:', JSON.stringify(c), '\nMonth to date:', (await db.rpc('ai_spend_this_month')).data);
} finally {
  await db.from('jobs').delete().eq('workspace_id', id);
  await db.from('workspaces').delete().eq('id', id);
}
