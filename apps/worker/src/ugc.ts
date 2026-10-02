// UGC engine level 1 (PRD section 22): find formats for the niche, remix one into a faceless video with
// three hook variants, or into a carousel. Every clip carries a licence; posting is copy-and-post until APIs are approved.
import { randomUUID } from 'node:crypto';
import {
  CarouselRemixSchema, NicheFormatsSchema, UGC_CAROUSEL_SYSTEM, UGC_CAROUSEL_VERSION, UGC_FORMATS_SYSTEM, UGC_FORMATS_VERSION, UGC_VIDEO_SYSTEM,
  UGC_VIDEO_VERSION, VideoRemixSchema, brandBlock, carouselRemixPrompt, fastModel, findUnsupportedClaims, generate, mockCarousel, mockNicheFormats,
  mockVideoRemix, nicheFormatsPrompt, videoRemixPrompt,
} from '@shipitloud/ai';
import { PlanLimitError, brandContext, publishScore } from '@shipitloud/engine';
import { prepareLogo, qa, renderPng, slugifyName, themeFromPalette } from './ugc-helpers.ts';
import { renderBeats, type Beat } from '@shipitloud/video';
import { aiLedger, check, db, enqueue } from './db.ts';
import { humanize } from './content.ts';
import { brandMotion, founderShots, stockEnabled, stockVideo, type Clip } from './footage.ts';

async function consume(workspaceId: string, metric: 'ai_drafts' | 'videos' | 'images', n: number, message: string) {
  const { data } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: metric, p_amount: n, p_cost: 0 });
  if (!data) throw new PlanLimitError(message);
}
const refund = (workspaceId: string, metric: string, n: number) => db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: metric, p_amount: -n, p_cost: 0 });

async function brandLook(workspaceId: string) {
  const [{ data: ws }, { data: kit }] = await Promise.all([
    db.from('workspaces').select('product_name, url').eq('id', workspaceId).single(),
    db.from('brand_kits').select('logo_url, palette, fonts').eq('workspace_id', workspaceId).maybeSingle(),
  ]);
  const logo = kit?.logo_url ? await prepareLogo(kit.logo_url) : null;
  return {
    name: ws!.product_name as string, url: ws!.url as string | null, logo: logo?.dataUri ?? null,
    theme: themeFromPalette([...(kit?.palette ?? []), ...(logo?.palette ?? [])]), font: (kit?.fonts ?? [])[0] ?? null,
  };
}

/** Upload with retries: a network blip shouldn't throw away minutes of rendering. */
const upload = async (path: string, body: Buffer, contentType: string) => {
  let last = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const up = await db.storage.from('assets').upload(path, body, { contentType, upsert: true }).catch((e: Error) => ({ error: { message: e.message } }));
    if (!up.error) return db.storage.from('assets').getPublicUrl(path).data.publicUrl;
    last = up.error.message;
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  throw new Error(`upload: ${last}`);
};

/** Library formats adapted to this founder's audience (10-12), saved as their own formats. */
export async function findNicheFormats(workspaceId: string) {
  const b = await brandContext(db, workspaceId);
  const { data: library } = await db.from('viral_formats').select('slug, kind, name, hook_pattern, structure, example').is('workspace_id', null).in('kind', ['video', 'carousel']);
  await consume(workspaceId, 'ai_drafts', 1, 'You’ve used this month’s AI drafts.');
  let out;
  try {
    out = await generate({
      ledger: aiLedger, purpose: 'ugc_formats', promptVersion: UGC_FORMATS_VERSION, workspaceId, model: fastModel(),
      system: UGC_FORMATS_SYSTEM, user: nicheFormatsPrompt(b, library ?? []), schema: NicheFormatsSchema, maxTokens: 3000, mock: () => mockNicheFormats(library ?? []),
    });
  } catch (err) { await refund(workspaceId, 'ai_drafts', 1); throw err; }
  const platforms = (kind: string) => (kind === 'carousel' ? ['instagram', 'linkedin'] : ['instagram', 'tiktok', 'youtube']);
  const rows = out.data.formats.slice(0, 14).map((f, i) => ({
    workspace_id: workspaceId, slug: `${slugifyName(f.name).slice(0, 40)}-${randomUUID().slice(0, 4)}`, kind: f.kind, platforms: platforms(f.kind),
    name: humanize(f.name).slice(0, 100), hook_pattern: humanize(f.hook_pattern), structure: humanize(f.structure), example: humanize(f.example), why: humanize(f.why),
    best_for: [], niche: b.target_customer?.slice(0, 120) ?? null, engagement: { base: f.base_slug, rank: i + 1 },
    // An example with made-up facts is labelled, so nobody posts it as-is.
    needs: findUnsupportedClaims(f.example, brandBlock(b)).length || /\[[^\]]+\]/.test(f.example) ? 'real numbers (the example’s are placeholders)' : null,
  }));
  check(await db.from('viral_formats').insert(rows), 'save formats');
  return rows.length;
}

function toBeat(b: { layout: string; text: string; sub: string; items: string[]; left_label: string; left_text: string; right_label: string; right_text: string }, media: Clip | null): Beat {
  const m = media && media.src ? { kind: media.kind, src: media.src } : null;
  switch (b.layout) {
    case 'split': return { layout: 'split', text: humanize(b.text), left: { label: humanize(b.left_label), text: humanize(b.left_text) }, right: { label: humanize(b.right_label), text: humanize(b.right_text) } };
    case 'list': return { layout: 'list', text: humanize(b.text), items: b.items.slice(0, 4).map(humanize) };
    case 'end': return { layout: 'end', text: humanize(b.text) };
    case 'caption': return { layout: 'caption', text: humanize(b.text), sub: humanize(b.sub) || undefined, media: m };
    default: return { layout: 'title', text: humanize(b.text), media: m };
  }
}

/** A faceless short video from a format, rendered in three hook variants (A, B, C). Counts as one video. */
export async function makeUgcVideo(workspaceId: string, formatId: string, topic = '') {
  const b = await brandContext(db, workspaceId);
  const { data: f } = await db.from('viral_formats').select('id, slug, kind, name, hook_pattern, structure, example').eq('id', formatId).single();
  if (!f || f.kind !== 'video') throw new Error('Pick a video format.');
  const shots = await founderShots(workspaceId);
  await consume(workspaceId, 'videos', 1, 'You’ve used this month’s videos, or your plan doesn’t include them.');
  try {
    await consume(workspaceId, 'ai_drafts', 1, 'You’ve used this month’s AI drafts.');
  } catch (err) { await refund(workspaceId, 'videos', 1); throw err; }
  try {
    const out = await generate({
      ledger: aiLedger, purpose: 'ugc_video', promptVersion: UGC_VIDEO_VERSION, workspaceId, model: fastModel(),
      system: UGC_VIDEO_SYSTEM, user: videoRemixPrompt(b, f, { shots: shots.length, broll: stockEnabled() }, topic), schema: VideoRemixSchema, maxTokens: 2000, mock: () => mockVideoRemix(b, shots.length),
    });
    const r = out.data;
    const look = await brandLook(workspaceId);
    const motion = await brandMotion();

    // Footage per beat, chosen once and shared by all three variants.
    let shotIdx = 0;
    const clips: (Clip | null)[] = [];
    for (const beat of r.beats) {
      if (beat.media === 'shot' && shots.length) clips.push(shots[shotIdx++ % shots.length]!);
      else if (beat.media === 'broll') clips.push((await stockVideo(beat.broll_query)) ?? null);
      else clips.push(null);
    }
    const used = [motion, ...clips.filter((c): c is Clip => !!c)];
    const footage = [...new Set(used.map((c) => c.clipId))];
    const licenceIds = [...new Set(used.map((c) => c.licenceId))];

    const caption = humanize(r.caption);
    const hashtags = r.hashtags.slice(0, 3).map((h) => h.replace(/^#/, '').replace(/\s+/g, ''));
    const onScreen = [...r.hooks, ...r.beats.map((x) => [x.text, x.sub, ...x.items, x.left_text, x.right_text].join(' '))].join(' ');
    const flags = findUnsupportedClaims(`${onScreen} ${caption}`, brandBlock(b));
    const score = publishScore({ platform: 'instagram', text: caption, flags });
    const ideaId = randomUUID();
    const hooks = r.hooks.slice(0, 3);
    const made: string[] = [];
    for (const [i, hook] of hooks.entries()) {
      const variant = 'ABC'[i]!;
      const beats = r.beats.map((x, j) => toBeat(j === 0 ? { ...x, text: hook } : x, clips[j] ?? null));
      const mp4 = await renderBeats({ name: look.name, host: look.url ? new URL(look.url).hostname.replace(/^www\./, '') : null, logo: look.logo, theme: look.theme, beats }, 'story');
      const url = await upload(`${workspaceId}/ugc/${ideaId}-${variant}.mp4`, mp4, 'video/mp4');
      const video = check(await db.from('ugc_videos').insert({
        workspace_id: workspaceId, format_id: f.id, format_slug: f.slug, kind: 'video', idea: humanize(r.idea).slice(0, 200), variant,
        script: { beats, caption, hashtags, audio: r.audio, idea_id: ideaId }, footage_sources: footage, licence_ids: licenceIds, file_url: url, status: 'ready', publish_score: score.score,
      }).select('id').single(), 'ugc video')!;
      const asset = check(await db.from('assets').insert({
        workspace_id: workspaceId, type: 'video', platform: 'instagram', title: `Short video ${variant}: ${humanize(hook)}`.slice(0, 140), status: 'pending',
        content: { ugc_video_id: video.id, idea_id: ideaId, variant, text: `${caption}${hashtags.length ? `\n\n${hashtags.map((h) => `#${h}`).join(' ')}` : ''}`, caption, hashtags, audio: r.audio, footage, platforms: ['instagram', 'tiktok', 'youtube'], format: f.name },
        file_url: url, flags, confidence: flags.length ? 60 : Math.min(75, score.score), publish_score: score.score, qa_score: score.score, prompt_version: UGC_VIDEO_VERSION, model: out.model,
      }).select('id').single(), 'video asset')!;
      await db.from('ugc_videos').update({ asset_id: asset.id }).eq('id', video.id);
      await enqueue(workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
      made.push(asset.id);
    }
    return { ideaId, variants: made.length };
  } catch (err) {
    await refund(workspaceId, 'videos', 1);
    await refund(workspaceId, 'ai_drafts', 1);
    throw err;
  }
}

/** A carousel (1080x1350 slides) from a format, in the brand's font when it's available. */
export async function makeCarousel(workspaceId: string, formatId: string, topic = '') {
  const b = await brandContext(db, workspaceId);
  const { data: f } = await db.from('viral_formats').select('id, slug, kind, name, hook_pattern, structure, example').eq('id', formatId).single();
  if (!f || f.kind !== 'carousel') throw new Error('Pick a carousel format.');
  await consume(workspaceId, 'ai_drafts', 1, 'You’ve used this month’s AI drafts.');
  let out;
  try {
    out = await generate({
      ledger: aiLedger, purpose: 'ugc_carousel', promptVersion: UGC_CAROUSEL_VERSION, workspaceId, model: fastModel(),
      system: UGC_CAROUSEL_SYSTEM, user: carouselRemixPrompt(b, f, topic), schema: CarouselRemixSchema, maxTokens: 1500, mock: () => mockCarousel(b),
    });
  } catch (err) { await refund(workspaceId, 'ai_drafts', 1); throw err; }
  const slides = out.data.slides.slice(0, 8);
  if (slides.length < 3) throw new Error('The carousel came back too short.');
  await consume(workspaceId, 'images', slides.length, 'You’ve used this month’s images.');
  const look = await brandLook(workspaceId);
  const brand = { name: look.name, url: look.url, logo: look.logo };
  const id = randomUUID();
  const urls: string[] = [];
  const n = slides.length;
  for (const [i, sl] of slides.entries()) {
    const page = `${i + 1}/${n}`;
    const [templateId, slots]: [string, Record<string, string>] = i === 0 ? ['slide-cover', { title: humanize(sl.title), kicker: '', page }]
      : i === n - 1 ? ['slide-end', { title: humanize(sl.title), body: humanize(sl.body), page }]
      : ['slide-point', { num: String(i).padStart(2, '0'), title: humanize(sl.title), body: humanize(sl.body), page }];
    const input = { templateId, format: 'portrait' as const, slots, theme: look.theme, brand, fontFamily: look.font };
    const q = qa(input);
    if (q.blocker) throw new Error(`Slide ${i + 1}: ${q.issues.join(', ')}`);
    urls.push(await upload(`${workspaceId}/ugc/${id}-${i + 1}.png`, await renderPng(input), 'image/png'));
  }
  const caption = humanize(out.data.caption);
  const hashtags = out.data.hashtags.slice(0, 3).map((h) => h.replace(/^#/, '').replace(/\s+/g, ''));
  const flags = findUnsupportedClaims(`${slides.map((s) => `${s.title} ${s.body}`).join(' ')} ${caption}`, brandBlock(b));
  const score = publishScore({ platform: 'instagram', text: caption, flags });
  const motion = await brandMotion();
  const video = check(await db.from('ugc_videos').insert({
    workspace_id: workspaceId, format_id: f.id, format_slug: f.slug, kind: 'carousel', idea: humanize(out.data.idea).slice(0, 200), script: { slides, caption, hashtags },
    footage_sources: [motion.clipId], licence_ids: [motion.licenceId], slides: urls, file_url: urls[0], status: 'ready', publish_score: score.score,
  }).select('id').single(), 'carousel')!;
  const asset = check(await db.from('assets').insert({
    workspace_id: workspaceId, type: 'poster', platform: 'instagram', title: `Carousel: ${humanize(slides[0]!.title)}`.slice(0, 140), status: 'pending',
    content: { kind: 'carousel', ugc_video_id: video.id, slides: urls, text: `${caption}${hashtags.length ? `\n\n${hashtags.map((h) => `#${h}`).join(' ')}` : ''}`, caption, hashtags, footage: [motion.clipId], platforms: ['instagram', 'linkedin'], format: f.name },
    file_url: urls[0], flags, confidence: flags.length ? 60 : Math.min(75, score.score), publish_score: score.score, qa_score: score.score, prompt_version: UGC_CAROUSEL_VERSION, model: out.model,
  }).select('id').single(), 'carousel asset')!;
  await db.from('ugc_videos').update({ asset_id: asset.id }).eq('id', video.id);
  await enqueue(workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
  return { slides: urls.length };
}
