// The 10-minute setup (PRD section 23): read the site once, then brand brain and growth analysis side by side, a
// channel plan from the product type's playbook, and the first wins. Also the free mini analysis for the landing page.
import { GROWTH_SYSTEM, GROWTH_VERSION, GrowthSchema, fastModel, findUnsupportedClaims, generate, growthPrompt, mockGrowth, type Growth } from '@shipitloud/ai';
import { prepareLogo, themeFromPalette } from '@shipitloud/templates';
import { auditHints, channelPlan, extractPage, growthScore, isStoreUrl, needsQuestions, presenceFrom, scrubNumbers, urlHint, type AuditHint, type Fit, type PageFacts } from '@shipitloud/engine';
import { listingAsSite, readListing } from './appstore.ts';
import { aiLedger, check, db, enqueue } from './db.ts';
import { buildBrand } from './brand.ts';
import { crawlSite, type SiteFacts } from './crawl.ts';
import { humanize } from './content.ts';
import { renderHtml } from './conversion.ts';
import { searchHN } from './sources.ts';
import { fitWords } from './posters.ts';

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

/** App Store keywords: whole words only, comma-separated, within Apple's 100 characters. */
function fitKeywords(k: string) {
  const out: string[] = [];
  for (const w of k.split(',').map((x) => x.trim()).filter(Boolean)) { if ([...out, w].join(',').length > 100) break; out.push(w); }
  return out.join(',');
}

/** The AI's read of the product, cleaned. Store links and repos override a vague product type. */
async function analyse(o: { name: string; url: string; fit: Fit | null; site: SiteFacts; page: PageFacts; hints: AuditHint[]; workspaceId?: string; purpose: string; isApp?: boolean; answers?: { who?: string; does?: string; different?: string } | null }) {
  const presence = presenceFrom(o.site.html, o.url);
  const out = await generate({
    ledger: aiLedger, purpose: o.purpose, promptVersion: GROWTH_VERSION, workspaceId: o.workspaceId ?? null, model: fastModel(),
    system: GROWTH_SYSTEM, schema: GrowthSchema, maxTokens: 2600, mock: () => mockGrowth(o.name, urlHint(o.url) ?? (o.isApp ? 'consumer_app' : 'b2b_saas')),
    user: growthPrompt({ name: o.name, url: o.url, fit: o.fit, pages: o.site.pages, page: o.page, hints: o.hints.map((h) => `(${h.area}) ${h.issue}`), presence: { ...presence }, isApp: o.isApp, answers: o.answers }),
  });
  const g: Growth = out.data;
  // Trim every list to its size here, so a model that returns one extra item never fails the analysis.
  g.hangouts = g.hangouts.slice(0, 5);
  g.competitor_gaps = g.competitor_gaps.slice(0, 4);
  g.opportunities = g.opportunities.slice(0, 3);
  g.search_phrases = g.search_phrases.slice(0, 4);
  g.review_themes = { loves: g.review_themes.loves.slice(0, 4), complaints: g.review_themes.complaints.slice(0, 4) };
  g.questions = { who: g.questions.who.slice(0, 3), does: g.questions.does.slice(0, 3), different: g.questions.different.slice(0, 3) };
  if (g.aso) g.aso = { ...g.aso, title: fitWords(g.aso.title, 30), subtitle: fitWords(g.aso.subtitle, 30), keywords: fitKeywords(g.aso.keywords), screenshots: g.aso.screenshots.slice(0, 6) };
  const hint = urlHint(o.url);
  if (hint && g.product_type === 'other') g.product_type = hint;
  if (!o.isApp) g.aso = null;
  if (o.fit === 'launching_soon' && g.stage !== 'pre_launch') g.stage = 'pre_launch';
  // Only numbers the site itself says survive: predictions ("would find 50+ users") are cut out.
  const facts = o.site.pages.map((p) => `${p.title}\n${p.text}`).join('\n');
  const clean = (t: string) => scrubNumbers(humanize(t), facts);
  const fixes = g.page_fixes.map((f) => ({ ...f, fix: clean(f.fix), why: clean(f.why) })).filter((f, i, all) => f.fix && all.findIndex((x) => x.area === f.area) === i).slice(0, 3);
  return {
    g: { ...g, summary: humanize(g.summary), problem: humanize(g.problem), positioning: clean(g.positioning) || humanize(g.positioning).replace(/\d[\d,.+]*\s*/g, ''), ideal_customer: humanize(g.ideal_customer),
      sample_post: clean(g.sample_post),
      page_fixes: fixes, opportunities: g.opportunities.map((x) => ({ title: humanize(x.title).replace(/\b(bot|auto-?repl\w*)\b/gi, 'replies'), why: clean(x.why) })).filter((x) => x.why),
      competitor_gaps: g.competitor_gaps.map((x) => ({ ...x, how_they_market: humanize(x.how_they_market), gap: clean(x.gap) })).filter((x) => x.gap) },
    presence, model: out.model,
  };
}

/** Understand the product and build the growth analysis + channel plan (acceptance: 90 seconds or less). */
export async function analyzeSetup(workspaceId: string, opts: { analysisId?: string } = {}) {
  const t0 = Date.now();
  await progress(workspaceId, 'understand');
  const w = check(await db.from('workspaces').select('product_name, url, fit, plan, app_links, setup_answers').eq('id', workspaceId).single(), 'ws')!;
  // The app may have created the row already (so the page shows progress at once); otherwise start one.
  const { data: row } = opts.analysisId ? { data: { id: opts.analysisId } } : await db.from('growth_analyses').insert({ workspace_id: workspaceId, url: w.url, status: 'running' }).select('id').single();
  try {
    const brain = (await db.from('brand_brains').select('description, status').eq('workspace_id', workspaceId).maybeSingle()).data;
    let site: SiteFacts | null = null;
    let page: PageFacts | null = null;
    // App links: read the store listing (reviews included); a website, if the founder gave one, is read too.
    const links = (w.app_links ?? {}) as { apple?: string; google?: string };
    const storeLink = isStoreUrl(w.url) ? w.url! : links.apple ?? links.google ?? null;
    const website = w.url && !isStoreUrl(w.url) ? w.url : null;
    const listing = storeLink ? await readListing(storeLink) : null;
    if (listing) {
      site = listingAsSite(listing);
      page = extractPage(site.html);
      if (website) {
        const web = await readSite(website).catch(() => null);
        if (web) site = { ...site, pages: [...site.pages, ...web.site.pages], html: `${web.site.html}${site.html}`, fontFamilies: web.site.fontFamilies };
      }
      await db.from('brand_kits').upsert({ workspace_id: workspaceId, screenshots: listing.screenshots, ...(listing.icon ? { logo_url: listing.icon } : {}), updated_at: new Date().toISOString() });
    } else if (website) ({ site, page } = await readSite(website));
    if (!site) {
      if (!brain?.description) throw new Error('Add your site link or a short description so we know what to work with.');
      // No site: the founder's own description stands in for the homepage.
      const html = `<h1>${w.product_name}</h1><p>${brain.description.replace(/</g, '')}</p>`;
      site = { pages: [{ url: '', title: w.product_name, text: brain.description }], html, meta: { icons: [] }, fontFamilies: [] };
      page = extractPage(html);
    }
    // Landing page checks only make sense for a website; a listing has its own fixes (the AI covers those).
    const hints = website && !listing ? auditHints(page!) : [];
    const answers = (w.setup_answers ?? null) as { who?: string; does?: string; different?: string } | null;
    const [, a] = await Promise.all([
      // A re-run keeps the founder's edited brand brain; only a first setup (or a failed one) builds it.
      brain?.status === 'ready' ? Promise.resolve() : buildBrand(workspaceId, { site: listing || website ? site : null }),
      analyse({ name: w.product_name, url: storeLink ?? website ?? '', fit: w.fit, site, page: page!, hints, workspaceId, purpose: 'growth_analysis', isApp: !!listing, answers }),
    ]);
    if (listing && ['other', 'b2b_saas'].includes(a.g.product_type)) a.g.product_type = 'consumer_app';
    const { data: b } = await db.from('brand_brains').select('competitors, status').eq('workspace_id', workspaceId).single();
    const count = (area: string) => hints.filter((h) => h.area === area).length;
    const score = growthScore({ pageIssues: { clarity: count('clarity'), cta: count('cta'), trust: count('trust') }, presence: a.presence, hasPricing: page!.trust.pricing, hasEmailForm: page!.forms > 0, competitorsKnown: (b?.competitors ?? []).length });
    const plan = channelPlan(a.g.product_type, { stage: a.g.stage, fit: w.fit, plan: w.plan, hasAppStore: a.presence.appStore || a.presence.playStore });
    await progress(workspaceId, 'understand', true);
    // App links and thin pages get 3 quick questions first (unless answered); everyone else goes to the summary.
    await progress(workspaceId, needsQuestions({ isApp: !!listing, words: page!.words }) && !answers ? 'questions' : 'summary');
    await db.from('growth_analyses').update({
      status: 'ready', product_type: a.g.product_type, stage: a.g.stage, pricing_model: a.g.pricing_model, summary: a.g.summary, problem: a.g.problem,
      ideal_customer: a.g.ideal_customer, hangouts: a.g.hangouts, positioning: a.g.positioning, page_fixes: a.g.page_fixes, competitor_gaps: a.g.competitor_gaps,
      presence: a.presence, growth_score: score.score, score_parts: score.parts, opportunities: a.g.opportunities, model: a.model, prompt_version: GROWTH_VERSION,
      seconds: Math.round((Date.now() - t0) / 1000),
      listing: listing ? { store: listing.store, url: listing.url, name: listing.name, category: listing.category, price: listing.price, icon: listing.icon, screenshots: listing.screenshots, rating: listing.rating, ratings: listing.ratings, reviews: listing.reviews.length, similar: listing.similar, website: listing.website } : null,
      aso: a.g.aso ?? null, review_themes: a.g.review_themes, questions: a.g.questions,
      needs_questions: needsQuestions({ isApp: !!listing, words: page!.words }),
    }).eq('id', row!.id);
    // Re-runs keep the founder's on/off choices for channels that are still in the plan.
    const { data: prev } = await db.from('channel_plans').select('channels, accepted_at').eq('workspace_id', workspaceId).maybeSingle();
    const choice = new Map(((prev?.accepted_at ? prev.channels : []) as { id: string; enabled: boolean }[]).map((c) => [c.id, c.enabled]));
    const merged = plan.map((c) => (choice.has(c.id) ? { ...c, enabled: choice.get(c.id)! } : c));
    await db.from('channel_plans').upsert({ workspace_id: workspaceId, playbook_type: a.g.product_type, channels: merged, accepted_at: prev?.accepted_at ?? null, updated_at: new Date().toISOString() });
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
    const listing = isStoreUrl(f.url) ? await readListing(f.url) : null;
    const { site, page } = listing ? (() => { const s = listingAsSite(listing); return { site: s, page: extractPage(s.html) }; })() : await readSite(f.url);
    const name = listing?.name.split(/[:|]/)[0]!.trim() || site.meta.siteName || page.title.split(/[|\-–—:]/)[0]!.trim() || new URL(f.url).hostname;
    const hints = listing ? [] : auditHints(page);
    const [a, brand] = await Promise.all([analyse({ name, url: f.url, fit: f.fit, site, page, hints, purpose: 'free_analysis', isApp: !!listing }), brandFromSite(site, f.url)]);
    if (listing && ['other', 'b2b_saas'].includes(a.g.product_type)) a.g.product_type = 'consumer_app';
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
        listing: listing ? { store: listing.store, rating: listing.rating, ratings: listing.ratings, screenshots: listing.screenshots.slice(0, 3) } : null,
        review_themes: listing ? a.g.review_themes : null, aso: a.g.aso ?? null,
      },
    }).eq('id', id);
  } catch (err) {
    await db.from('free_analyses').update({ status: 'failed', error: (err instanceof Error ? err.message : String(err)).slice(0, 300), finished_at: new Date().toISOString() }).eq('id', id);
  }
}
