// One real draft of the four waitlist emails for review (~$0.003). No sending. Cleans up.
import '../src/env.ts';
import { db } from '../src/db.ts';
import { draftWaitlistEmails } from '../src/emails.ts';

const { data: u } = await db.auth.admin.createUser({ email: `em+${Date.now()}@shipitloud.test`, password: `Pw-${Date.now()}-x`, email_confirm: true });
const { data: ws } = await db.from('workspaces').insert({ owner_id: u.user!.id, product_name: 'Balans', url: 'https://balans.ng', plan: 'grow', launch_date: '2026-10-20' }).select('id').single();
try {
  await db.from('brand_brains').insert({ workspace_id: ws!.id, status: 'ready', one_liner: 'Invoice from WhatsApp, get paid to your bank', target_customer: 'Freelancers in Nigeria', pain_points: ['Chasing clients for payment'] });
  await db.from('voice_profiles').insert({ workspace_id: ws!.id, tone: 'casual, practical' });
  await draftWaitlistEmails(ws!.id);
  const { data } = await db.from('assets').select('title, flags, content').eq('workspace_id', ws!.id).eq('type', 'email');
  for (const a of data ?? []) { const c = a.content as { subject: string; text: string; cta_label: string }; console.log(`\n=== ${a.title}${a.flags?.length ? ` FLAGS ${a.flags.join('; ')}` : ''}\nSubject: ${c.subject}\n${c.text}\n[${c.cta_label}]`); }
  const { data: cost } = await db.from('ai_calls').select('cost_usd').eq('workspace_id', ws!.id);
  console.log('\ncost', cost?.map((c) => Number(c.cost_usd).toFixed(4)).join(', '));
} finally {
  await db.from('workspaces').delete().eq('id', ws!.id);
  await db.auth.admin.deleteUser(u.user!.id);
}
