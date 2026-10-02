// PRD section 22 acceptance check with real AI: formats for Balans, a video with 3 hook variants (licences
// recorded), and a carousel. Prints everything for review, saves the media locally, then cleans up. ~$0.01.
import '../src/env.ts';
import { writeFile } from 'node:fs/promises';
import { db } from '../src/db.ts';
import { findNicheFormats, makeCarousel, makeUgcVideo } from '../src/ugc.ts';

const out = process.argv[2] ?? '.';
const { data: u } = await db.auth.admin.createUser({ email: `ugc+${Date.now()}@shipitloud.test`, password: `Pw-${Date.now()}-x`, email_confirm: true });
const { data: ws } = await db.from('workspaces').insert({ owner_id: u.user!.id, product_name: 'Balans', url: 'https://balans.ng', plan: 'grow' }).select('id').single();
const id = ws!.id;
try {
  await db.from('brand_brains').insert({ workspace_id: id, status: 'ready', one_liner: 'Invoice from WhatsApp, get paid to your bank', target_customer: 'Freelancers and small businesses in Nigeria', pain_points: ['Chasing clients for payment', 'Making invoices by hand'], competitors: ['Wave'] });
  await db.from('voice_profiles').insert({ workspace_id: id, tone: 'casual, cheeky, practical' });
  await db.from('brand_kits').insert({ workspace_id: id, logo_url: 'https://balans.ng/apple-icon.png', palette: ['#10231c', '#fdbf2f'], fonts: ['Inter'] });

  const n = await findNicheFormats(id);
  const { data: fm } = await db.from('viral_formats').select('id, kind, name, hook_pattern, example, why').eq('workspace_id', id);
  console.log(`\n${n} formats for Balans:`);
  for (const f of fm ?? []) console.log(`  [${f.kind}] ${f.name}\n      ${f.example.replace(/\n/g, ' / ').slice(0, 160)}`);

  const vid = (fm ?? []).find((f) => f.kind === 'video')!;
  const t = Date.now();
  const r = await makeUgcVideo(id, vid.id);
  const { data: vs } = await db.from('ugc_videos').select('variant, file_url, script, footage_sources, licence_ids').eq('workspace_id', id).eq('kind', 'video').order('variant');
  console.log(`\nvideo "${vid.name}": ${r.variants} variants in ${Math.round((Date.now() - t) / 1000)}s`);
  for (const v of vs ?? []) {
    const s = v.script as { beats: { layout: string; text: string }[]; caption: string; hashtags: string[]; audio: string };
    console.log(`  ${v.variant}: ${s.beats.map((b) => `[${b.layout}] ${b.text}`).join(' | ')}`);
    await writeFile(`${out}/ugc-${v.variant}.mp4`, Buffer.from(await (await fetch(v.file_url!)).arrayBuffer()));
  }
  const s0 = vs![0]!.script as { caption: string; hashtags: string[]; audio: string };
  console.log(`  caption: ${s0.caption} ${s0.hashtags.map((h) => `#${h}`).join(' ')} · audio: ${s0.audio}`);
  console.log(`  footage: ${JSON.stringify(vs![0]!.footage_sources)} · licences recorded: ${vs![0]!.licence_ids.length}`);
  const { data: va } = await db.from('assets').select('flags, publish_score').eq('workspace_id', id).eq('type', 'video');
  console.log(`  flags: ${JSON.stringify(va?.[0]?.flags)} · score ${va?.[0]?.publish_score}`);

  const car = (fm ?? []).find((f) => f.kind === 'carousel');
  if (car) {
    await makeCarousel(id, car.id);
    const { data: c } = await db.from('ugc_videos').select('slides, script').eq('workspace_id', id).eq('kind', 'carousel').single();
    const sc = c!.script as { slides: { title: string; body: string }[]; caption: string };
    console.log(`\ncarousel "${car.name}":`);
    sc.slides.forEach((sl, i) => console.log(`  ${i + 1}. ${sl.title}${sl.body ? ` — ${sl.body}` : ''}`));
    for (const [i, url] of (c!.slides as string[]).entries()) await writeFile(`${out}/ugc-slide-${i + 1}.png`, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  const { data: cost } = await db.from('ai_calls').select('purpose, cost_usd').eq('workspace_id', id);
  console.log('\ncost', cost?.map((c) => `${c.purpose} $${Number(c.cost_usd).toFixed(4)}`).join(', '));
} finally {
  for (const dir of ['ugc', 'posters']) {
    const { data: files } = await db.storage.from('assets').list(`${id}/${dir}`);
    if (files?.length) await db.storage.from('assets').remove(files.map((f) => `${id}/${dir}/${f.name}`));
  }
  await db.from('jobs').delete().eq('workspace_id', id);
  await db.from('footage_licences').delete().eq('workspace_id', id);
  await db.from('workspaces').delete().eq('id', id);
  await db.auth.admin.deleteUser(u.user!.id);
}
