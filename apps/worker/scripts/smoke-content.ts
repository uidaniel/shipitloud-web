// One real week plan (and optionally a repurpose) for a Balans-like workspace, printed for review. Cleans up.
// Cost: about $0.015 for the week, $0.01 for a repurpose. Run: npx tsx scripts/smoke-content.ts [repurpose]
import '../src/env.ts';
import { db } from '../src/db.ts';
import { makeContentWeek, repurpose } from '../src/content.ts';

const { data: u } = await db.auth.admin.createUser({ email: `content+${Date.now()}@shipitloud.test`, password: `Pw-${Date.now()}-x`, email_confirm: true });
await db.from('profiles').update({ timezone: 'Africa/Lagos' }).eq('id', u.user!.id);
const { data: ws } = await db.from('workspaces').insert({ owner_id: u.user!.id, product_name: 'Balans', url: 'https://balans.ng', plan: 'grow' }).select('id').single();
const id = ws!.id;
try {
  await db.from('brand_brains').insert({
    workspace_id: id, status: 'ready', one_liner: 'Invoice from WhatsApp, get paid to your bank', target_customer: 'Freelancers and small businesses in Nigeria',
    pain_points: ['Chasing clients for payment', 'Making invoices by hand'], keywords: ['whatsapp invoice'], competitors: ['Wave'],
    content_pillars: ['Getting paid on time', 'Freelance money tips', 'Building Balans in public', 'Customer questions'],
  });
  await db.from('voice_profiles').insert({ workspace_id: id, tone: 'casual, practical, a bit cheeky', sample_posts: [
    'Clients don’t pay late because they’re broke. They pay late because nobody reminded them. Send one message on day 3. That’s it.',
    'Week 4 of building Balans. Rewrote the invoice screen three times. The fix was deleting two fields, not adding one.',
  ] });
  await db.from('brand_kits').insert({ workspace_id: id });
  await db.from('product_updates').insert({ workspace_id: id, source: 'manual', external_id: 'm1', title: 'Clients can now pay a deposit up front', body: 'Set a deposit when you create the invoice; the client pays it first, the rest later.' });
  await db.from('mentions').insert({ workspace_id: id, source: 'hn', external_id: 'x1', url: 'https://news.ycombinator.com/item?id=1', title: 'How do you get clients to pay invoices on time?', text: 'Freelancer here, half my clients pay 30+ days late.', heuristic_score: 80, relevance_score: 82 });

  const n = await makeContentWeek(id);
  const { data: posts } = await db.from('assets').select('id, platform, title, scheduled_for, publish_score, flags, content').eq('workspace_id', id).order('scheduled_for');
  console.log(`\n${n} drafted\n`);
  for (const p of posts ?? []) {
    const c = p.content as { text: string; format_slug?: string; source?: string; score_tips?: string[] };
    console.log(`=== ${p.platform} · ${new Date(p.scheduled_for!).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', hour: '2-digit', minute: '2-digit' })} Lagos · ${c.format_slug ?? '-'} · ${c.source ?? '-'} · score ${p.publish_score}${p.flags?.length ? ` · FLAGS ${p.flags.join('; ')}` : ''}`);
    console.log(c.text);
    if (c.score_tips?.length) console.log(`   tips: ${c.score_tips.join(' | ')}`);
    console.log();
  }
  if (process.argv.includes('repurpose')) {
    const li = (posts ?? []).find((p) => p.platform === 'linkedin');
    if (li) {
      const r = await repurpose(id, li.id);
      const { data: rp } = await db.from('assets').select('type, platform, content, file_url').eq('workspace_id', id).eq('prompt_version', 'repurpose@1');
      console.log(`\n--- repurposed from "${li.title}":`, JSON.stringify(r));
      for (const a of rp ?? []) console.log(`[${a.type}/${a.platform}] ${a.type === 'poster' ? JSON.stringify((a.content as { slots: unknown }).slots) + ' ' + a.file_url : (a.content as { text: string }).text}\n`);
    }
  }
  const { data: cost } = await db.from('ai_calls').select('purpose, cost_usd').eq('workspace_id', id);
  console.log('cost', cost?.map((c) => `${c.purpose} $${Number(c.cost_usd).toFixed(4)}`).join(', '));
} finally {
  const { data: files } = await db.storage.from('assets').list(`${id}/posters`);
  if (files?.length) await db.storage.from('assets').remove(files.map((f) => `${id}/posters/${f.name}`));
  await db.from('jobs').delete().eq('workspace_id', id);
  await db.from('workspaces').delete().eq('id', id);
  await db.auth.admin.deleteUser(u.user!.id);
}
