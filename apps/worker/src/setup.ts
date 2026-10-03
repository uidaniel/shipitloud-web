// The 10-minute setup (PRD section 23): read the site once, then brand brain and growth analysis side by side, a
// channel plan from the product type's playbook, and the first wins. Also the free mini analysis for the landing page.
import { GROWTH_SYSTEM, GROWTH_VERSION, GrowthSchema, fastModel, findUnsupportedClaims, generate, growthPrompt, mockGrowth, type Growth } from '@shipitloud/ai';
import { prepareLogo, themeFromPalette } from '@shipitloud/templates';
import { auditHints, channelPlan, extractPage, growthScore, presenceFrom, scrubNumbers, urlHint, type AuditHint, type Fit, type PageFacts } from '@shipitloud/engine';
import { aiLedger, check, db, enqueue } from './db.ts';
import { buildBrand } from './brand.ts';
import { crawlSite, type SiteFacts } from './crawl.ts';
import { humanize } from './content.ts';
import { renderHtml } from './conversion.ts';
import { searchHN } from './sources.ts';

export async function progress(workspaceId: string, step: string, done = false) {
  if (done) await db.from('setup_progress').upsert({ workspace_id: workspaceId, step, completed_at: new Date().toISOString() }, { onConflict: 'workspace_id,step' });
  else await db.from('setup_progress').upsert({ workspace_id: workspaceId, step }, { onConflict: 'workspace_id,step', ignoreDuplicates: true });
}

/** Read a site once; pages built in the browser are rendered so there's something to read. */
async function readSite(url: string): Promise<{ site: SiteFacts; page: PageFacts }> {
  let site = await crawlSite(url);
  let page = extractPage(site.html);
  if (!page.h1.length && page.words < 80) {
    try {
      const html = await renderHtml(url);
      const rendered = extractPage(html);
      if (rendered.words > page.words) {
        page = rendered;
        site = { ...site, html, pages: [{ ...site.pages[0]!, text: rendered.text }, ...site.pages.slice(1)] };
      }
    } catch { /* keep what the plain fetch saw */ }
  }
  return { site, page };
}

/** The AI's read of the product, cleaned. Store links and repos override a vague product type. */
async function analyse(o: { name: string; url: string; fit: Fit | null; site: SiteFacts; page: PageFacts; hints: AuditHint[]; workspaceId?: string; purpose: string }) {
  const presence = presenceFrom(o.site.html, o.url);
  const out = await generate({
    ledger: aiLedger, purpose: o.purpose, promptVersion: GROWTH_VERSION, workspaceId: o.workspaceId ?? null, model: fastModel(),
    system: GROWTH_SYSTEM, schema: GrowthSchema, maxTokens: 2000, mock: () => mockGrowth(o.name, urlHint(o.url) ?? 'b2b_saas'),
    user: growthPrompt({ name: o.name, url: o.url, fit: o.fit, pages: o.site.pages, page: o.page, hints: o.hints.map((h) => `(${h.area}) ${h.issue}`), presence: { ...presence } }),
  });
  const g: Growth = out.data;
  const hint = urlHint(o.url);
  if (hint && g.product_type === 'other') g.product_type = hint;
  if (o.fit === 'launching_soon' && g.stage !== 'pre_launch') g.stage = 'pre_launch';
  // Only numbers the site itself says survive: predictions ("would find 50+ users") are cut out.
  const facts = o.site.pages.map((p) => `${p.title}\n${p.text}`).join('\n');
  const clean = (t: string) => scrubNumbers(humanize(t), facts);
  const fixes = g.page_fixes.map((f) => ({ ...f, fix: clean(f.fix), why: clean(f.why) })).filter((f, i, all) => f.fix && all.findIndex((x) => x.area === f.area) === i);
  return {
    g: { ...g, summary: humanize(g.summary), problem: humanize(g.problem), positioning: clean(g.positioning) || humanize(g.positioning).replace(/\d[\d,.+]*\s*/g, ''), ideal_customer: humanize(g.ideal_customer),
      sample_post: clean(g.sample_post),
      page_fixes: fixes, opportunities: g.opportunities.map((x) => ({ title: humanize(x.title).replace(/\b(bot|auto-?repl\w*)\b/gi, 'replies'), why: clean(x.why) })).filter((x) => x.why),
      competitor_gaps: g.competitor_gaps.map((x) => ({ ...x, how_they_market: humanize(x.how_they_market), gap: clean(x.gap) })).filter((x) => x.gap) },
    presence, model: out.model,
  };
}

/** Understand the product and build the growth analysis + channel plan (acceptance: 90 seconds or less). */
export async function analyzeSetup(workspaceId: string) {
  const t0 = Date.now();
  await progress(workspaceId, 'understand');
  const w = check(await db.from('workspaces').select('product_name, url, fit, plan').eq('id', workspaceId).single(), 'ws')!;
  const { data: row } = await db.from('growth_analyses').insert({ workspace_id: workspaceId, url: w.url, status: 'running' }).select('id').single();
  try {
    const brain = (await db.from('brand_brains').select('description, status').eq('workspace_id', workspaceId).maybeSingle()).data;
    let site: SiteFacts | null = null;
    let page: PageFacts | null = null;
    if (w.url) ({ site, page } = await readSite(w.url));
    if (!site) {
      if (!brain?.description) throw new Error('Add your site link or a short description so we know what to work with.');
      // No site: the founder's own description stands in for the homepage.
      const html = `<h1>${w.product_name}</h1><p>${brain.description.replace(/</g, '')}</p>`;
      site = { pages: [{ url: '', title: w.product_name, text: brain.description }], html, meta: { icons: [] }, fontFamilies: [] };
      page = extractPage(html);
    }
    const hints = w.url ? auditHints(page!) : [];
    const [, a] = await Promise.all([
      // A re-run keeps the founder's edited brand brain; only a first setup (or a failed one) builds it.
      brain?.status === 'ready' ? Promise.resolve() : buildBrand(workspaceId, { site: w.url ? site : null }),
      analyse({ name: w.product_name, url: w.url ?? '', fit: w.fit, site, page: page!, hints, workspaceId, purpose: 'growth_analysis' }),
    ]);
    const { data: b } = await db.from('brand_brains').select('competitors, status').eq('workspace_id', workspaceId).single();
    const count = (area: string) => hints.filter((h) => h.area === area).length;
    const score = growthScore({ pageIssues: { clarity: count('clarity'), cta: count('cta'), trust: count('trust') }, presence: a.presence, hasPricing: page!.trust.pricing, hasEmailForm: page!.forms > 0, competitorsKnown: (b?.competitors ?? []).length });
    const plan = channelPlan(a.g.product_type, { stage: a.g.stage, fit: w.fit, plan: w.plan, hasAppStore: a.presence.appStore || a.presence.playStore });
    await db.from('growth_analyses').update({
      status: 'ready', product_type: a.g.product_type, stage: a.g.stage, pricing_model: a.g.pricing_model, summary: a.g.summary, problem: a.g.problem,
      ideal_customer: a.g.ideal_customer, hangouts: a.g.hangouts, positioning: a.g.positioning, page_fixes: a.g.page_fixes, competitor_gaps: a.g.competitor_gaps,
      presence: a.presence, growth_score: score.score, score_parts: score.parts, opportunities: a.g.opportunities, model: a.model, prompt_version: GROWTH_VERSION,
      seconds: Math.round((Date.now() - t0) / 1000),
    }).eq('id', row!.id);
    // Re-runs keep the founder's on/off choices for channels that are still in the plan.
    const { data: prev } = await db.from('channel_plans').select('channels, accepted_at').eq('workspace_id', workspaceId).maybeSingle();
    const choice = new Map(((prev?.accepted_at ? prev.channels : []) as { id: string; enabled: boolean }[]).map((c) => [c.id, c.enabled]));
    const merged = plan.map((c) => (choice.has(c.id) ? { ...c, enabled: choice.get(c.id)! } : c));
    await db.from('channel_plans').upsert({ workspace_id: workspaceId, playbook_type: a.g.product_type, channels: merged, accepted_at: prev?.accepted_at ?? null, updated_at: new Date().toISOString() });
    await progress(workspaceId, 'understand', true);
    await progress(workspaceId, 'summary');
    return { seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (err) {
    await db.from('growth_analyses').update({ status: 'failed', error: (err instanceof Error ? err.message : String(err)).slice(0, 300) }).eq('id', row!.id);
    throw err;
  }
}

/** First wins: warm leads, the first week of posts, network launch messages and the 30-day plan, in parallel jobs. */
export async function startFirstWins(workspaceId: string) {
  await progress(workspaceId, 'wins');
  const [{ data: brain }, { data: plan }, { data: cfg }] = await Promise.all([
    db.from('brand_brains').select('keywords, competitors').eq('workspace_id', workspaceId).single(),
    db.from('channel_plans').select('channels, playbook_type').eq('workspace_id', workspaceId).single(),
    db.from('listen_configs').select('backfilled_at').eq('workspace_id', workspaceId).maybeSingle(),
  ]);
  const enabled = new Set(((plan?.channels ?? []) as { id: string; enabled: boolean }[]).filter((c) => c.enabled).map((c) => c.id));
  // Warm leads: listen where this product's people talk, and look back 30 days.
  const sources = ['hn', 'bluesky', ...(enabled.has('github') || plan?.playbook_type === 'dev_tool' ? ['github'] : [])];
  await db.from('listen_configs').upsert({ workspace_id: workspaceId, active: true, keywords: (brain?.keywords ?? []).slice(0, 8), competitors: (brain?.competitors ?? []).slice(0, 5), sources, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
  if (!cfg?.backfilled_at) await enqueue(workspaceId, 'listen.poll', { backfill: true }, { key: `backfill:${workspaceId}` });
  await enqueue(workspaceId, 'content.week', {}, { key: `setupweek:${workspaceId}` });
  await enqueue(workspaceId, 'kit.network', {}, { key: `setupnet:${workspaceId}` });
  await enqueue(workspaceId, 'kit.plan', {}, { key: `setupplan:${workspaceId}` });
}

// ---------------------------------------------------------------- free mini analysis (landing page)
/** The visitor's own brand, from their site: logo (and its colors), theme color, font and preview image. */
async function brandFromSite(site: SiteFacts, url: string) {
  const icon = site.meta.icons.find((i) => /apple-touch|apple-icon/i.test(i)) ?? site.meta.icons.find((i) => /\.(png|svg)(\?|$)/i.test(i)) ?? site.meta.icons[0] ?? null;
  const logo = icon ? await prepareLogo(icon) : null;
  const palette = [...new Set([...(site.meta.themeColor ? [site.meta.themeColor] : []), ...(logo?.palette ?? [])])];
  const theme = themeFromPalette(palette);
  return { logo: logo?.dataUri ?? null, accent: theme.accent, onAccent: theme.onAccent, palette: palette.slice(0, 5), font: site.fontFamilies[0] ?? null, ogImage: site.meta.ogImage ?? null, host: new URL(url).hostname.replace(/^www\./, '') };
}

/** Real conversations on Hacker News in the last 30 days for the product's search phrases (free API, honest count). */
async function conversations(phrases: string[]) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const seen = new Map<string, { title: string; url: string; phrase: string }>();
  for (const q of phrases.slice(0, 3)) {
    for (const f of await searchHN(q, since).catch(() => [])) {
      if (!seen.has(f.external_id)) seen.set(f.external_id, { title: (f.title ?? f.text).replace(/\s+/g, ' ').slice(0, 140), url: f.url, phrase: q });
    }
  }
  // Too few to mean anything: show nothing rather than a weak "1 conversation".
  if (seen.size < 3) return { count: 0, examples: [] };
  return { count: seen.size, examples: [...seen.values()].filter((x) => x.title.length > 20).slice(0, 2) };
}

/** The lead magnet: summary, positioning, top 3 page fixes and recommended channels, in the visitor's own brand. */
export async function freeAnalysis(id: string) {
  const { data: f } = await db.from('free_analyses').select('id, url, fit, status').eq('id', id).single();
  if (!f || f.status !== 'running') return;
  const t0 = Date.now();
  try {
    const { site, page } = await readSite(f.url);
    const name = site.meta.siteName || page.title.split(/[|\-–—:]/)[0]!.trim() || new URL(f.url).hostname;
    const hints = auditHints(page);
    const [a, brand] = await Promise.all([analyse({ name, url: f.url, fit: f.fit, site, page, hints, purpose: 'free_analysis' }), brandFromSite(site, f.url)]);
    const plan = channelPlan(a.g.product_type, { stage: a.g.stage, fit: f.fit }).filter((c) => c.enabled).slice(0, 5);
    const count = (area: string) => hints.filter((h) => h.area === area).length;
    const score = growthScore({ pageIssues: { clarity: count('clarity'), cta: count('cta'), trust: count('trust') }, presence: a.presence, hasPricing: page.trust.pricing, hasEmailForm: page.forms > 0, competitorsKnown: a.g.competitor_gaps.length });
    const talk = await conversations(a.g.search_phrases);
    // The sample post must only use the site's facts; if the claim check flags it, we don't show it.
    const post = a.g.sample_post;
    const postOk = !findUnsupportedClaims(post, site.pages.map((p) => p.text).join('\n')).length;
    await db.from('free_analyses').update({
      status: 'ready', finished_at: new Date().toISOString(),
      results: {
        name, brand, summary: a.g.summary, positioning: a.g.positioning, product_type: a.g.product_type, stage: a.g.stage, page_fixes: a.g.page_fixes,
        channels: plan.map((c) => ({ name: c.name, reason: c.reason, role: c.role })), score: score.score, opportunities: a.g.opportunities,
        sample_post: postOk ? post : null, conversations: talk, phrases: a.g.search_phrases, seconds: Math.round((Date.now() - t0) / 1000),
      },
    }).eq('id', id);
  } catch (err) {
    await db.from('free_analyses').update({ status: 'failed', error: (err instanceof Error ? err.message : String(err)).slice(0, 300), finished_at: new Date().toISOString() }).eq('id', id);
  }
}
