// One real launch-posts run for Balans, printing claim flags. Cleans up after itself.
import '../src/env.ts';
import { db } from '../src/db.ts';
import { makeLaunchPosts } from '../src/launch.ts';

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
  await db.from('voice_profiles').insert({ workspace_id: id, tone: 'casual, practical, a bit cheeky, local', dos: ['Use Nigerian context'], donts: ['Corporate jargon'] });
  await makeLaunchPosts(id);
  const { data: assets } = await db.from('assets').select('title, content, flags').eq('workspace_id', id);
  for (const a of assets ?? []) {
    console.log(`\n### ${a.title}${a.flags?.length ? `   FLAGS: ${a.flags.join('; ')}` : ''}\n${(a.content as { text: string }).text}`);
  }
  const { data: c } = await db.from('ai_calls').select('cost_usd').eq('workspace_id', id);
  console.log('\nCost:', JSON.stringify(c), 'Month to date:', (await db.rpc('ai_spend_this_month')).data);
} finally {
  await db.from('jobs').delete().eq('workspace_id', id);
  await db.from('workspaces').delete().eq('id', id);
}
