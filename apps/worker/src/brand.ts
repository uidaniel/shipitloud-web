import { BRAND_BRAIN_SYSTEM, BRAND_BRAIN_VERSION, BrandBrainSchema, BudgetExceededError, brandBrainPrompt, generate, mockBrandBrain, smartModel } from '@shipitloud/ai';
import { crawlSite, type SiteFacts } from './crawl.ts';
import { aiLedger, check, db } from './db.ts';

/** Onboarding: read the site, draft the brand brain + voice, and record what we found for the brand kit. */
export async function buildBrand(workspaceId: string, opts: { site?: SiteFacts | null } = {}) {
  const ws = check(await db.from('workspaces').select('product_name, url').eq('id', workspaceId).single(), 'ws')!;
  const brain = check(await db.from('brand_brains').select('description, status').eq('workspace_id', workspaceId).maybeSingle(), 'brain');
  await db.from('brand_brains').upsert({ workspace_id: workspaceId, status: 'building', error: null, updated_at: new Date().toISOString() });

  try {
    let pages: { url: string; title: string; text: string }[] = [];
    let siteFacts: Awaited<ReturnType<typeof crawlSite>> | null = null;
    if (opts.site) {
      siteFacts = opts.site;
      pages = siteFacts.pages.map((p) => ({ ...p }));
      if (siteFacts.meta.description && pages[0]) pages[0].text = `Meta description: ${siteFacts.meta.description}\n${pages[0].text}`;
    } else if (ws.url) {
      siteFacts = await crawlSite(ws.url);
      pages = siteFacts.pages;
      if (siteFacts.meta.description) pages[0]!.text = `Meta description: ${siteFacts.meta.description}\n${pages[0]!.text}`;
    }
    if (!pages.length && !brain?.description) throw new Error('Add your site link or a short description so we know what to work with.');

    const { data, model } = await generate({
      ledger: aiLedger,
      purpose: 'brand_brain',
      promptVersion: BRAND_BRAIN_VERSION,
      workspaceId,
      model: smartModel(),
      system: BRAND_BRAIN_SYSTEM,
      user: brandBrainPrompt({ name: ws.product_name, url: ws.url, description: brain?.description ?? null, pages }),
      schema: BrandBrainSchema,
      maxTokens: 1800,
      mock: () => mockBrandBrain(ws.product_name),
    });

    const now = new Date().toISOString();
    check(await db.from('brand_brains').update({
      status: 'ready', error: null, one_liner: data.one_liner, summary: data.summary, category: data.category,
      target_customer: data.target_customer, pain_points: data.pain_points, keywords: data.keywords, competitors: data.competitors,
      content_pillars: data.content_pillars, confidence: Math.round(data.confidence), sources: pages.map((p) => p.url),
      model, prompt_version: BRAND_BRAIN_VERSION, updated_at: now,
    }).eq('workspace_id', workspaceId), 'save brain');
    check(await db.from('voice_profiles').upsert({
      workspace_id: workspaceId, tone: data.voice.tone, style_notes: data.voice.style_notes, dos: data.voice.do, donts: data.voice.dont, updated_at: now,
    }), 'save voice');

    // Brand kit starting point from the site itself (logo + colors + fonts are refined in the brand kit step).
    if (siteFacts) {
      const logo = siteFacts.meta.icons.find((i) => /apple-icon|apple-touch|\.svg/i.test(i)) ?? siteFacts.meta.icons[0] ?? null;
      const palette = siteFacts.meta.themeColor ? [siteFacts.meta.themeColor] : [];
      await db.from('brand_kits').upsert({ workspace_id: workspaceId, logo_url: logo, palette, fonts: siteFacts.fontFamilies, updated_at: now });
    }
  } catch (err) {
    const msg = err instanceof BudgetExceededError
      ? 'ShipItLoud’s AI budget for this month is used up. It resets on the 1st.'
      : err instanceof Error ? err.message : String(err);
    await db.from('brand_brains').update({ status: 'failed', error: msg.slice(0, 300) }).eq('workspace_id', workspaceId);
    if (err instanceof BudgetExceededError) return; // don't retry: retrying can't help until next month
    throw err;
  }
}
