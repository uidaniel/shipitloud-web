// Demo video: screenshots (founder uploads, or sections of their homepage) + an AI script, rendered by Remotion
// into 9:16, 1:1 and 16:9 cuts. One set counts as one video against the plan.
import { randomUUID } from 'node:crypto';
import { chromium, type Browser } from 'playwright-core';
import {
  BudgetExceededError, type BrandContext, VIDEO_SCRIPT_SYSTEM, VIDEO_SCRIPT_VERSION, VideoScriptSchema, fastModel, findUnsupportedClaims, generate, mockVideoScript, videoScriptPrompt,
} from '@shipitloud/ai';
import { prepareLogo, themeFromPalette } from '@shipitloud/templates';
import { VIDEO_FORMATS, renderVideo, type Shot, type VideoFormat } from '@shipitloud/video';
import { aiLedger, check, db, enqueue } from './db.ts';
import { PlanLimitError, brandContext } from './launch.ts';

const MAX_SHOTS = 3;
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

interface Captured { desktop: Buffer | null; mobile: Buffer | null; headings: string[] }

const publicUrl = (path: string) => db.storage.from('assets').getPublicUrl(path).data.publicUrl;

async function upload(path: string, body: Buffer, contentType: string) {
  const up = await db.storage.from('assets').upload(path, body, { contentType, upsert: true });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  return publicUrl(path);
}

// Viewports are 1.4 screens tall so the frame has room to scroll inside the video.
const TALL = 1.4;

async function open(browser: Browser, url: string, vp: { width: number; height: number }, mobile: boolean) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: Math.round(vp.height * TALL) }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 25_000 }).catch(() => page.waitForLoadState('load'));
  await page.waitForTimeout(800);
  return page;
}

/** Scrolls the real viewport to `y` and waits, so scroll-reveal animations and lazy images have played. */
async function shoot(page: Awaited<ReturnType<typeof open>>, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
  await page.waitForTimeout(1200);
  return page.screenshot({ type: 'jpeg', quality: 85 });
}

/** Up to three homepage sections, each with the headings visible in it so captions describe the real screen. */
export async function captureSite(url: string): Promise<Captured[]> {
  const browser = await chromium.launch({ executablePath: process.env.VIDEO_BROWSER || undefined });
  try {
    const d = await open(browser, url, DESKTOP, false);
    const heads = await d.evaluate(() => [...document.querySelectorAll('h1, h2, h3')]
      .map((h) => ({ tag: h.tagName, text: (h as HTMLElement).innerText.trim().replace(/\s+/g, ' '), y: h.getBoundingClientRect().top + window.scrollY }))
      .filter((h) => h.text && h.text.length < 120));
    const height = await d.evaluate(() => document.documentElement.scrollHeight);
    const maxY = Math.max(0, height - Math.round(DESKTOP.height * TALL));

    // Section starts: the top, then the next headings that are at least a screen apart.
    const starts = [0];
    // Prefer section headings (h2); fall back to any heading on pages without them.
    const marks = heads.some((h) => h.tag === 'H2') ? heads.filter((h) => h.tag === 'H2') : heads;
    for (const h of marks) if (starts.length < MAX_SHOTS && h.y - starts.at(-1)! >= DESKTOP.height * 0.9 && h.y - 60 <= maxY) starts.push(Math.max(0, h.y - 60));

    const m = await open(browser, url, MOBILE, true);
    const mHeads = await m.evaluate(() => [...document.querySelectorAll('h1, h2, h3')].map((h) => ({ text: (h as HTMLElement).innerText.trim().replace(/\s+/g, ' '), y: h.getBoundingClientRect().top + window.scrollY })));
    const mMax = Math.max(0, (await m.evaluate(() => document.documentElement.scrollHeight)) - Math.round(MOBILE.height * TALL));

    const out: Captured[] = [];
    for (const [i, y] of starts.entries()) {
      const inSection = heads.filter((h) => h.y >= y - 80 && h.y < y + DESKTOP.height).map((h) => h.text).slice(0, 4);
      const desktop = await shoot(d, y);
      // Same section on mobile: find its first heading there.
      const anchor = i === 0 ? 0 : mHeads.find((h) => h.text === inSection[0])?.y;
      const mobile = anchor != null ? await shoot(m, Math.min(Math.max(0, anchor - 40), mMax)) : null;
      out.push({ desktop, mobile, headings: inSection });
    }
    return out;
  } finally {
    await browser.close();
  }
}

/** Founder-uploaded screenshots in `<ws>/shots/`, oldest first. */
async function uploadedShots(workspaceId: string): Promise<Shot[]> {
  const { data } = await db.storage.from('assets').list(`${workspaceId}/shots`, { sortBy: { column: 'created_at', order: 'asc' } });
  return (data ?? []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name)).slice(0, 5).map((f) => {
    const url = publicUrl(`${workspaceId}/shots/${f.name}`);
    // Uploads named *-mobile.* or taller than wide are treated as phone screens by the client; here we only know the name.
    return /mobile|phone/i.test(f.name) ? { caption: '', mobile: url } : { caption: '', desktop: url };
  });
}

export async function makeDemoVideo(workspaceId: string, opts: { formats?: VideoFormat[] } = {}) {
  const b = await brandContext(workspaceId);
  const formats = (opts.formats ?? (Object.keys(VIDEO_FORMATS) as VideoFormat[])).filter((f) => f in VIDEO_FORMATS);

  const { data: allowed } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'videos', p_amount: 1, p_cost: 0 });
  if (!allowed) throw new PlanLimitError('Demo videos come with the Launch Pass and paid plans, or you’ve used this month’s videos.');

  try {
    return await build(workspaceId, b, formats);
  } catch (err) {
    // Failed renders don't count against the plan; the job retries with a fresh charge.
    await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'videos', p_amount: -1, p_cost: 0 });
    throw err;
  }
}

async function build(workspaceId: string, b: BrandContext, formats: VideoFormat[]) {
  // 1. Screenshots
  let shots = await uploadedShots(workspaceId);
  let headings: string[][] = shots.map(() => []);
  if (!shots.length) {
    if (!b.url) throw new Error('Add your site link or upload a few screenshots first.');
    const caps = await captureSite(b.url);
    const batch = randomUUID().slice(0, 8);
    shots = await Promise.all(caps.map(async (c, i) => ({
      caption: '',
      desktop: c.desktop ? await upload(`${workspaceId}/video/${batch}-${i}-d.jpg`, c.desktop, 'image/jpeg') : null,
      mobile: c.mobile ? await upload(`${workspaceId}/video/${batch}-${i}-m.jpg`, c.mobile, 'image/jpeg') : null,
    })));
    headings = caps.map((c) => c.headings);
  }

  // 2. Script (one small call)
  const launched = !!b.launch_date && Date.parse(b.launch_date) <= Date.now();
  let script;
  try {
    script = await generate({
      ledger: aiLedger, purpose: 'video_script', promptVersion: VIDEO_SCRIPT_VERSION, workspaceId, model: fastModel(),
      system: VIDEO_SCRIPT_SYSTEM, user: videoScriptPrompt(b, headings.map((h) => ({ headings: h })), launched),
      schema: VideoScriptSchema, maxTokens: 500, mock: () => mockVideoScript(b, shots.length, launched),
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) throw new Error('AI budget reached for this month. Try again next month or raise the cap.');
    throw err;
  }
  const s = script.data;
  shots = shots.map((shot, i) => ({ ...shot, caption: s.captions[i] ?? s.captions.at(-1) ?? b.name }));
  const text = [s.hook, ...shots.map((x) => x.caption), s.cta].join(' ');
  const flags = findUnsupportedClaims(text, [b.one_liner, b.target_customer, ...b.pain_points].join(' '));

  // 3. Brand look, same as posters
  const kit = (await db.from('brand_kits').select('logo_url, palette').eq('workspace_id', workspaceId).maybeSingle()).data;
  const logo = kit?.logo_url ? await prepareLogo(kit.logo_url) : null;
  const theme = themeFromPalette([...(kit?.palette ?? []), ...(logo?.palette ?? [])]);
  const host = b.url ? new URL(b.url).hostname.replace(/^www\./, '') : null;
  const props = { name: b.name, host, logo: logo?.dataUri ?? null, theme, hook: s.hook, shots, cta: s.cta };

  // 4. Render every cut and upload
  const id = randomUUID();
  const cuts: Partial<Record<VideoFormat, string>> = {};
  for (const f of formats) {
    const t = Date.now();
    const mp4 = await renderVideo(props, f);
    cuts[f] = await upload(`${workspaceId}/video/${id}-${f}.mp4`, mp4, 'video/mp4');
    console.log(`[video] ${f} ${(mp4.length / 1e6).toFixed(1)}MB in ${Math.round((Date.now() - t) / 1000)}s`);
  }

  const asset = check(await db.from('assets').insert({
    workspace_id: workspaceId, type: 'video', platform: 'instagram', title: s.title || `${b.name} demo video`,
    content: { cuts, script: { hook: s.hook, captions: shots.map((x) => x.caption), cta: s.cta }, music: s.music, shots: shots.map((x) => ({ desktop: x.desktop, mobile: x.mobile })) },
    file_url: cuts.story ?? Object.values(cuts)[0] ?? null, template_id: 'demo', qa_score: 90, publish_score: 90,
    confidence: flags.length ? 60 : 85, flags, prompt_version: VIDEO_SCRIPT_VERSION, model: script.model,
  }).select('id').single(), 'asset');
  await enqueue(workspaceId, 'asset.intake', { asset_id: asset!.id }, { key: `intake:${asset!.id}` });
  return { assetId: asset!.id, cuts };
}
