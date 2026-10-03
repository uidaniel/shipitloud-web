// Ads autopilot: creatives drafted from the brand kit, launched only after the founder approves, synced hourly with
// hard caps enforced here (not trusted to the platform), optimized daily within the caps, all logged to ad_events.
import { randomUUID } from 'node:crypto';
import { AD_COPY_SYSTEM, AD_COPY_VERSION, AdCopySchema, adCopyPrompt, brandBlock, fastModel, findUnsupportedClaims, generate, mockAdCopy } from '@shipitloud/ai';
import { execute, registerProvider } from '@shipitloud/core';
import { PlanLimitError, anomaly, brandContext, capState, money, optimize, policyCheck, splitBudget, type AdStats } from '@shipitloud/engine';
import { prepareLogo, qa, renderPng, themeFromPalette } from '@shipitloud/templates';
import { actionsRepo, aiLedger, check, db, enqueue } from '../db.ts';
import { humanize } from '../content.ts';
import { appUrl } from '../env.ts';
import { fitWords } from '../posters.ts';
import { google, meta, simulator, type AdPlatform, type CampaignInput } from './platform.ts';

export interface Campaign {
  id: string; workspace_id: string; platform: 'meta' | 'google'; name: string; goal: 'signups' | 'traffic' | 'installs'; landing_url: string; regions: string[];
  daily_cap_cents: number; total_cap_cents: number; spent_cents: number; spent_today_cents: number; mode: 'test' | 'autopilot'; status: string; pause_reason: string | null;
  special_category: string | null; external_id: string | null; simulated: boolean; approved_at: string | null; launched_at: string | null; last_optimized_at: string | null;
}
interface AdRow { id: string; campaign_id: string; asset_id: string | null; external_id: string | null; external_adset_id: string | null; status: string; pause_reason: string | null; budget_cents: number; spend_cents: number; impressions: number; clicks: number; conversions: number }

const today = (d = new Date()) => d.toISOString().slice(0, 10);
const load = async (id: string) => check(await db.from('ad_campaigns').select('*').eq('id', id).single(), 'campaign') as Campaign;
const adsOf = async (id: string) => (check(await db.from('ads').select('*').eq('campaign_id', id).order('created_at'), 'ads') ?? []) as AdRow[];
const note = (c: Campaign, action: string, reason: string, o: { ad?: string | null; amount?: number | null; actor?: 'ai' | 'founder' | 'system' } = {}) =>
  db.from('ad_events').insert({ workspace_id: c.workspace_id, campaign_id: c.id, ad_id: o.ad ?? null, action, reason, amount_cents: o.amount ?? null, actor: o.actor ?? 'ai' });
const input = (c: Campaign): CampaignInput => ({ name: c.name, goal: c.goal, regions: c.regions, special_category: c.special_category, total_cap_cents: c.total_cap_cents });

/** The live platform when it's connected and we're in live mode; the simulator otherwise (and for simulated campaigns). */
async function platformFor(c: Pick<Campaign, 'workspace_id' | 'platform' | 'simulated'>): Promise<AdPlatform> {
  if (c.simulated) return simulator({ overspend: Number(process.env.ADS_SIM_OVERSPEND ?? 1) || 1 });
  const token = await actionsRepo.getToken(c.workspace_id, c.platform);
  const { data: s } = await db.from('ad_settings').select('meta_pixel_id, meta_ad_account, meta_page_id, google_customer').eq('workspace_id', c.workspace_id).maybeSingle();
  if (c.platform === 'meta' && token && s?.meta_ad_account && s.meta_page_id) return meta({ token, adAccount: s.meta_ad_account, pageId: s.meta_page_id, pixelId: s.meta_pixel_id });
  if (c.platform === 'google' && token && s?.google_customer && process.env.GOOGLE_ADS_DEVELOPER_TOKEN) return google({ token, customerId: s.google_customer, developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN, loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID });
  throw new Error(`${c.platform === 'meta' ? 'Meta' : 'Google Ads'} isn’t connected, so this campaign can’t run live.`);
}
async function canGoLive(workspaceId: string, platform: 'meta' | 'google') {
  if (process.env.ACTIONS_MODE !== 'live') return false;
  try { await platformFor({ workspace_id: workspaceId, platform, simulated: false }); return true; } catch { return false; }
}

// ---------------------------------------------------------------- creatives
/** Draft ad creatives: AI copy (policy pre-checked), images from the brand kit. Each becomes an ad waiting for approval. */
export async function draftCreatives(campaignId: string, n = 3, o: { refreshOf?: string; auto?: boolean } = {}) {
  const c = await load(campaignId);
  const b = await brandContext(db, c.workspace_id);
  const { data: used } = await db.rpc('consume_usage', { p_workspace: c.workspace_id, p_metric: 'ai_drafts', p_amount: 1, p_cost: 0 });
  if (!used) throw new PlanLimitError('You’ve used this month’s AI drafts.');
  const existing = (await db.from('assets').select('content').eq('workspace_id', c.workspace_id).eq('type', 'ad_creative').eq('content->>campaign_id', campaignId)).data ?? [];
  const out = await generate({
    ledger: aiLedger, purpose: 'ad_copy', promptVersion: AD_COPY_VERSION, workspaceId: c.workspace_id, model: fastModel(),
    system: AD_COPY_SYSTEM, user: adCopyPrompt(b, { goal: c.goal, n, avoid: existing.map((e) => String((e.content as { angle?: string }).angle ?? '')).filter(Boolean) }),
    schema: AdCopySchema, maxTokens: 1500, mock: () => mockAdCopy(b, n),
  });
  const facts = brandBlock(b);
  const kit = (await db.from('brand_kits').select('logo_url, palette').eq('workspace_id', c.workspace_id).maybeSingle()).data;
  const logo = kit?.logo_url ? await prepareLogo(kit.logo_url) : null;
  const theme = themeFromPalette([...(kit?.palette ?? []), ...(logo?.palette ?? [])]);
  const brand = { name: b.name, url: b.url, logo: logo?.dataUri ?? null };
  let made = 0;
  for (const v of out.data.variants.slice(0, n)) {
    const copy = { headline: humanize(v.headline).slice(0, 60), primary_text: humanize(v.primary_text).slice(0, 300), description: humanize(v.description).slice(0, 60), cta: v.cta };
    const all = `${copy.headline} ${copy.primary_text} ${copy.description} ${v.image_headline}`;
    const pol = policyCheck(all, facts);
    const flags = [...pol.flags, ...findUnsupportedClaims(all, facts)];
    if (pol.special && !c.special_category) {
      c.special_category = pol.special;
      await db.from('ad_campaigns').update({ special_category: pol.special }).eq('id', c.id);
      await note(c, 'policy_block', `Looks like a ${pol.special.replace('_', ' ')} ad: Meta requires its special ad category, which limits targeting to countries only.`, { actor: 'system' });
    }
    // The image: the brand's own template with the words on it (AI never draws text or logos).
    const slots = { headline: fitWords(humanize(v.image_headline), 48), highlight: v.image_highlight && humanize(v.image_headline).includes(v.image_highlight) ? fitWords(v.image_highlight, 20) : '', sub: fitWords(copy.description, 90), kicker: fitWords(b.name, 28) };
    let fileUrl: string | null = null;
    const q = qa({ templateId: 'announce', format: 'square', slots, theme, brand });
    const { data: img } = await db.rpc('consume_usage', { p_workspace: c.workspace_id, p_metric: 'images', p_amount: 1, p_cost: 0 });
    if (!q.blocker && img) {
      const png = await renderPng({ templateId: 'announce', format: 'square', slots, theme, brand });
      const path = `${c.workspace_id}/ads/${randomUUID()}.png`;
      const up = await db.storage.from('assets').upload(path, png, { contentType: 'image/png', upsert: false });
      if (!up.error) fileUrl = db.storage.from('assets').getPublicUrl(path).data.publicUrl;
    }
    // A refresh in autopilot goes live on its own when it passes every check; anything flagged waits for the founder.
    const auto = !!o.auto && !flags.length && c.mode === 'autopilot';
    const asset = check(await db.from('assets').insert({
      workspace_id: c.workspace_id, type: 'ad_creative', platform: c.platform, title: `Ad: ${copy.headline}`.slice(0, 140), status: auto ? 'auto_approved' : 'pending',
      content: { campaign_id: c.id, angle: humanize(v.angle), ...copy, image_headline: slots.headline, special: pol.special, policy_flags: pol.flags, refresh_of: o.refreshOf ?? null, text: `${copy.primary_text}\n\n${copy.headline}` },
      file_url: fileUrl, template_id: 'announce', flags, confidence: flags.length ? 50 : 70, prompt_version: AD_COPY_VERSION, model: out.model,
    }).select('id').single(), 'ad creative')!;
    await db.from('ads').insert({ workspace_id: c.workspace_id, campaign_id: c.id, asset_id: asset.id, status: 'waiting' });
    if (auto) await enqueue(c.workspace_id, 'ads.add', { campaign_id: c.id }, { key: `adsadd:${c.id}:${asset.id}` });
    else await enqueue(c.workspace_id, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
    made++;
  }
  if (c.status === 'drafting') await db.from('ad_campaigns').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', c.id);
  return made;
}

// ---------------------------------------------------------------- spending goes through the actions gate
// Every budget commitment (launch, resume, raising an ad's budget) is a "spend" through execute(): kill switch,
// daily cap, total cap, idempotency and the audit log all apply there. Pausing never needs the gate.
async function gate(c: Campaign, key: string, amountCents: number, committedTodayCents: number, payload: Record<string, unknown>) {
  return execute(actionsRepo, {
    workspaceId: c.workspace_id, kind: 'spend', provider: 'ads', idempotencyKey: key, amountCents,
    spend: { dailyCapCents: c.daily_cap_cents, totalCapCents: c.total_cap_cents, spentTodayCents: committedTodayCents, spentTotalCents: c.spent_cents },
    payload: { ...payload, campaign_id: c.id },
  });
}

registerProvider({
  id: 'ads', automatic: true, internal: true,   // the platform layer decides real vs simulated itself
  async execute(p) {
    if (p.op === 'launch') return launchNow(String(p.campaign_id));
    if (p.op === 'resume') return resumeNow(String(p.campaign_id));
    if (p.op === 'budget') return budgetNow(String(p.campaign_id), String(p.ad_id), Number(p.cents));
    throw new Error(`unknown ads op ${String(p.op)}`);
  },
});

/** Launch an approved campaign: only when the founder approved it and at least one creative. */
export async function launch(campaignId: string) {
  const c = await load(campaignId);
  if (!c.approved_at) throw new Error('The founder hasn’t approved this campaign');
  if (c.status === 'active') return { status: 'already live' };
  const ready = await approvedWaiting(c);
  if (!ready.length) { await db.from('ad_campaigns').update({ status: 'ready', error: 'Approve at least one ad first.' }).eq('id', c.id); return { status: 'nothing approved' }; }
  // One launch per approval: a retried job can't launch twice, and approving again after a block tries again.
  const row = await gate(c, `ads:launch:${c.id}:${c.approved_at}`, c.daily_cap_cents, 0, { op: 'launch', title: c.name });
  if (row.status !== 'executed') {
    await db.from('ad_campaigns').update({ status: row.status === 'failed' ? 'failed' : c.status, error: row.reason }).eq('id', c.id);
    await note(c, 'policy_block', `Not launched: ${row.reason}`, { actor: 'system' });
  }
  return { status: row.status, reason: row.reason };
}

async function approvedWaiting(c: Campaign) {
  const ads = (await adsOf(c.id)).filter((a) => a.status === 'waiting' && a.asset_id);
  if (!ads.length) return [];
  const { data: ok } = await db.from('assets').select('id').in('id', ads.map((a) => a.asset_id!)).in('status', ['approved', 'auto_approved', 'published', 'scheduled']);
  const ids = new Set((ok ?? []).map((x) => x.id));
  return ads.filter((a) => ids.has(a.asset_id!));
}

async function creativeFor(c: Campaign, a: AdRow, i: number) {
  const { data: asset } = await db.from('assets').select('content, file_url').eq('id', a.asset_id!).single();
  const k = (asset?.content ?? {}) as { headline: string; primary_text: string; description: string; cta: string; angle?: string };
  return { name: `${k.angle ?? `Ad ${i + 1}`}`.slice(0, 60), headline: k.headline, primary_text: k.primary_text, description: k.description, cta: k.cta, image_url: asset?.file_url ?? null, link: c.landing_url };
}

async function launchNow(campaignId: string) {
  const c = await load(campaignId);
  const p = await platformFor(c);
  // Idempotent: a retry reuses the platform campaign and the ads already created.
  let external = c.external_id;
  if (!external) {
    external = (await p.createCampaign(input(c))).id;
    await db.from('ad_campaigns').update({ external_id: external }).eq('id', c.id);
    await note(c, 'create', `Campaign created${p.simulated ? ' (test mode: simulated, no real money)' : ''}, paused until the ads are ready`, { actor: 'system' });
  }
  const ready = await approvedWaiting(c);
  const budgets = splitBudget(c.daily_cap_cents, ready.map(() => 1));
  for (const [i, a] of ready.entries()) {
    let ext = { adId: a.external_id, adsetId: a.external_adset_id };
    if (!ext.adId) {
      const made = await p.createAd(external, input(c), await creativeFor(c, a, i), budgets[i]!);
      ext = { adId: made.adId, adsetId: made.adsetId };
    }
    await p.setStatus('ad', ext.adId!, true);
    await db.from('ads').update({ external_id: ext.adId, external_adset_id: ext.adsetId, status: 'active', budget_cents: budgets[i], updated_at: new Date().toISOString() }).eq('id', a.id);
    await db.from('assets').update({ status: 'published' }).eq('id', a.asset_id!);
    await note(c, 'launch', `Ad live with ${money(budgets[i]!)} a day`, { ad: a.id, amount: budgets[i], actor: 'founder' });
  }
  await p.setStatus('campaign', external, true);
  await db.from('ad_campaigns').update({ status: 'active', launched_at: c.launched_at ?? new Date().toISOString(), pause_reason: null, error: null, updated_at: new Date().toISOString() }).eq('id', c.id);
  await note(c, 'launch', `Launched ${ready.length} ad${ready.length === 1 ? '' : 's'}: ${money(c.daily_cap_cents)}/day cap, ${money(c.total_cap_cents)} total cap, ${c.regions.join(', ')}`, { amount: c.daily_cap_cents, actor: 'founder' });
  return { externalId: external, stats: { ads: ready.length } };
}

/** New creatives approved while a campaign runs: add them, and rebalance budgets within the daily cap. */
export async function addAds(campaignId: string) {
  const c = await load(campaignId);
  if (c.status !== 'active') return { added: 0 };
  const ready = await approvedWaiting(c);
  if (!ready.length) return { added: 0 };
  const p = await platformFor(c);
  const running = (await adsOf(c.id)).filter((a) => a.status === 'active');
  // Each new ad gets an equal share; the running ads keep their proportions (autopilot's winners stay ahead).
  const share = Math.floor(c.daily_cap_cents / (running.length + ready.length));
  const rest = splitBudget(c.daily_cap_cents - share * ready.length, running.map((a) => a.budget_cents || 1));
  const budgets = [...rest, ...ready.map(() => share)];
  // Lower the running ads first so the total never goes above the cap, even for a moment.
  for (const [i, a] of running.entries()) if (budgets[i]! < a.budget_cents) { await p.setBudget(a.external_adset_id!, budgets[i]!); await db.from('ads').update({ budget_cents: budgets[i] }).eq('id', a.id); }
  for (const [j, a] of ready.entries()) {
    const cents = budgets[running.length + j]!;
    const made = await p.createAd(c.external_id!, input(c), await creativeFor(c, a, running.length + j), cents);
    await p.setStatus('ad', made.adId, true);
    await db.from('ads').update({ external_id: made.adId, external_adset_id: made.adsetId, status: 'active', budget_cents: cents }).eq('id', a.id);
    await db.from('assets').update({ status: 'published' }).eq('id', a.asset_id!);
    await note(c, 'refresh', `New ad added with ${money(cents)} a day`, { ad: a.id, amount: cents });
  }
  return { added: ready.length };
}

async function budgetNow(campaignId: string, adId: string, cents: number) {
  const c = await load(campaignId);
  const a = (await adsOf(c.id)).find((x) => x.id === adId);
  if (!a?.external_adset_id) throw new Error('ad not live');
  await (await platformFor(c)).setBudget(a.external_adset_id, cents);
  await db.from('ads').update({ budget_cents: cents, updated_at: new Date().toISOString() }).eq('id', a.id);
  return { externalId: a.external_adset_id };
}

async function resumeNow(campaignId: string) {
  const c = await load(campaignId);
  const p = await platformFor(c);
  for (const a of (await adsOf(c.id)).filter((x) => x.status === 'paused' && x.pause_reason == null && x.external_id)) {
    await p.setStatus('ad', a.external_id!, true);
    await db.from('ads').update({ status: 'active' }).eq('id', a.id);
  }
  if (c.external_id) await p.setStatus('campaign', c.external_id, true);
  await db.from('ad_campaigns').update({ status: 'active', pause_reason: null, updated_at: new Date().toISOString() }).eq('id', c.id);
  return { externalId: c.external_id ?? undefined };
}

/** Pause a whole campaign. Always allowed, in every mode, kill switch or not. */
export async function pauseCampaign(campaignId: string, reason: string, o: { actor?: 'ai' | 'founder' | 'system'; action?: string; status?: 'paused' | 'capped' | 'ended' } = {}) {
  const c = await load(campaignId);
  if (!['active', 'paused'].includes(c.status) && !(o.status === 'ended' && c.status !== 'ended')) return;
  const ads = (await adsOf(c.id)).filter((a) => a.status === 'active');
  try {
    const p = await platformFor(c);
    if (c.external_id) await p.setStatus('campaign', c.external_id, false);
    for (const a of ads) if (a.external_id) await p.setStatus('ad', a.external_id, false);
  } catch (err) {
    await note(c, 'sync_error', `Couldn’t pause on the platform: ${(err as Error).message}. Pause it there by hand.`, { actor: 'system' });
  }
  // Ads paused with the campaign keep pause_reason null, so they come back on resume; ads the AI paused don't.
  if (ads.length) await db.from('ads').update({ status: 'paused', updated_at: new Date().toISOString() }).in('id', ads.map((a) => a.id));
  await db.from('ad_campaigns').update({ status: o.status ?? 'paused', pause_reason: reason, updated_at: new Date().toISOString() }).eq('id', c.id);
  await note(c, o.action ?? 'pause', reason, { actor: o.actor ?? 'ai' });
}

/** Resume a paused campaign (founder, or the next day after a daily-cap pause). Spending again goes through the gate. */
export async function resume(campaignId: string, actor: 'founder' | 'system' = 'founder') {
  const c = await load(campaignId);
  if (c.status !== 'paused') return { status: 'not paused' };
  // Resuming only claims what's left of today's cap; when today's is used up, it waits for tomorrow.
  const left = c.daily_cap_cents - c.spent_today_cents;
  if (left <= 0) { await note(c, 'policy_block', 'Today’s cap is already used, so it stays paused. Resume it tomorrow.', { actor: 'system' }); return { status: 'blocked', reason: 'daily cap used' }; }
  const row = await gate(c, `ads:resume:${c.id}:${actor === 'system' ? today() : Date.now()}`, left, c.spent_today_cents, { op: 'resume', title: c.name });
  if (row.status === 'executed') await note(c, 'resume', actor === 'system' ? 'New day: back on, within the daily cap' : 'Resumed by you', { actor, amount: left });
  else await note(c, 'policy_block', `Not resumed: ${row.reason}`, { actor: 'system' });
  return { status: row.status, reason: row.reason };
}

/** Kill switch: pause every running campaign in the workspace right away. */
export async function pauseAll(workspaceId: string, reason = 'Kill switch: all ads stopped') {
  const { data } = await db.from('ad_campaigns').select('id').eq('workspace_id', workspaceId).in('status', ['active']);
  for (const c of data ?? []) await pauseCampaign(c.id, reason, { actor: 'founder', action: 'kill' });
  return { paused: data?.length ?? 0 };
}

// ---------------------------------------------------------------- hourly sync: spend, caps, anomalies
const DAILY_CAP_PAUSE = 'Daily cap reached. Back on tomorrow.';

export async function sync(campaignId: string, now = new Date()) {
  let c = await load(campaignId);
  if (!['active', 'paused'].includes(c.status) || !c.launched_at) return;
  const p = await platformFor(c);
  const day = today(now);
  const fraction = (now.getUTCHours() * 60 + now.getUTCMinutes()) / 1440;
  const ads = (await adsOf(c.id)).filter((a) => a.external_id);
  for (const a of ads) {
    // Keep what was already recorded for today if the ad has since been paused (the simulator reports 0 for it).
    const { data: prev } = await db.from('ad_daily').select('spend_cents, impressions, clicks, conversions').eq('ad_id', a.id).eq('day', day).maybeSingle();
    const s = await p.insights({ key: a.id, external_id: a.external_id, adset_id: a.external_adset_id, budget_cents: a.budget_cents, status: a.status }, day, fraction);
    const keep = prev && prev.spend_cents > s.spend_cents ? prev : s;
    await db.from('ad_daily').upsert({ ad_id: a.id, day, ...keep }, { onConflict: 'ad_id,day' });
  }
  // Totals from the daily rows: what the platform says was spent.
  const { data: rows } = await db.from('ad_daily').select('ad_id, day, spend_cents, impressions, clicks, conversions').in('ad_id', ads.length ? ads.map((a) => a.id) : ['00000000-0000-0000-0000-000000000000']);
  const by = new Map<string, { spend_cents: number; impressions: number; clicks: number; conversions: number }>();
  let spentToday = 0;
  let spent = 0;
  const perDay = new Map<string, number>();
  for (const r of rows ?? []) {
    const t = by.get(r.ad_id) ?? { spend_cents: 0, impressions: 0, clicks: 0, conversions: 0 };
    t.spend_cents += r.spend_cents; t.impressions += r.impressions; t.clicks += r.clicks; t.conversions += r.conversions;
    by.set(r.ad_id, t);
    spent += r.spend_cents;
    if (r.day === day) spentToday += r.spend_cents;
    else perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.spend_cents);
  }
  for (const [id, t] of by) await db.from('ads').update(t).eq('id', id);
  await db.from('ad_campaigns').update({ spent_cents: spent, spent_today_cents: spentToday, last_synced_at: now.toISOString() }).eq('id', c.id);
  c = { ...c, spent_cents: spent, spent_today_cents: spentToday };
  const caps = { dailyCapCents: c.daily_cap_cents, totalCapCents: c.total_cap_cents };
  const past = [...perDay.values()];

  if (c.status === 'active') {
    const odd = anomaly(spentToday, caps, past.length ? past.reduce((a, b) => a + b, 0) / past.length : undefined);
    if (odd) {
      await pauseCampaign(c.id, `Paused to protect your budget: ${odd}. Check it, then resume.`, { action: 'anomaly', actor: 'system' });
      await enqueue(c.workspace_id, 'notify', { kind: 'ad_anomaly', title: `We paused “${c.name}”`, body: `${odd}. Nothing more will spend until you resume it.`, url: `${appUrl()}/app/${c.workspace_id}/ads` }, { key: `notify:anomaly:${c.id}:${day}` });
      return;
    }
    const state = capState(spentToday, spent, caps);
    if (state === 'total') {
      await pauseCampaign(c.id, `Total cap of ${money(c.total_cap_cents)} reached. The campaign is done.`, { action: 'cap_reached', actor: 'system', status: 'capped' });
      await enqueue(c.workspace_id, 'notify', { kind: 'ad_cap', title: `“${c.name}” spent its full budget`, body: `${money(spent)} of ${money(c.total_cap_cents)}. See what it brought in.`, url: `${appUrl()}/app/${c.workspace_id}/ads` }, { key: `notify:capped:${c.id}` });
    } else if (state === 'daily') {
      await pauseCampaign(c.id, DAILY_CAP_PAUSE, { action: 'cap_reached', actor: 'system' });
    } else {
      // Near the end of the total budget, lower the ads' daily budgets to what's left, so the last day can't overshoot.
      const running = (await adsOf(c.id)).filter((a) => a.status === 'active' && a.external_adset_id);
      const left = c.total_cap_cents - spent;
      const committed = running.reduce((n, a) => n + a.budget_cents, 0);
      if (running.length && left < committed) {
        const cuts = splitBudget(Math.max(running.length * 100, left), running.map((a) => a.budget_cents || 1));
        for (const [i, a] of running.entries()) {
          if (cuts[i]! >= a.budget_cents) continue;
          await p.setBudget(a.external_adset_id!, cuts[i]!);
          await db.from('ads').update({ budget_cents: cuts[i] }).eq('id', a.id);
          await note(c, 'shift_budget', `${money(a.budget_cents)} → ${money(cuts[i]!)} a day: only ${money(left)} of the total budget is left`, { ad: a.id, amount: cuts[i], actor: 'system' });
        }
      }
    }
  } else if (c.status === 'paused' && c.pause_reason === DAILY_CAP_PAUSE && spentToday < c.daily_cap_cents && capState(spentToday, spent, caps) === 'ok') {
    // A new day (spend today is below the cap again): turn back on through the gate.
    const lastPause = (await db.from('ad_events').select('created_at').eq('campaign_id', c.id).eq('action', 'cap_reached').order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
    if (!lastPause || lastPause.created_at.slice(0, 10) < day) await resume(c.id, 'system');
  }
}

// ---------------------------------------------------------------- daily optimizer (autopilot only)
export async function optimizeCampaign(campaignId: string, now = new Date()) {
  const c = await load(campaignId);
  if (c.status !== 'active' || !c.launched_at) return { actions: 0, note: 'not running' };
  const ads = (await adsOf(c.id)).filter((a) => a.status === 'active' || a.status === 'paused');
  const since = today(new Date(now.getTime() - 7 * 86_400_000));
  const { data: rows } = await db.from('ad_daily').select('ad_id, day, spend_cents, impressions, clicks, conversions').in('ad_id', ads.map((a) => a.id)).gte('day', since).order('day');
  const stats: AdStats[] = ads.map((a) => {
    const r = (rows ?? []).filter((x) => x.ad_id === a.id);
    const sum = (k: 'spend_cents' | 'impressions' | 'clicks' | 'conversions', xs = r) => xs.reduce((n, x) => n + x[k], 0);
    const ctr = (xs: typeof r) => (sum('impressions', xs) ? sum('clicks', xs) / sum('impressions', xs) : null);
    return { id: a.id, status: a.status, budget_cents: a.budget_cents, spend_cents: sum('spend_cents'), impressions: sum('impressions'), clicks: sum('clicks'), conversions: sum('conversions'), ctr_first3: ctr(r.slice(0, 3)), ctr_last3: r.length >= 6 ? ctr(r.slice(-3)) : null, impressions_last3: sum('impressions', r.slice(-3)) };
  });
  const age = (now.getTime() - Date.parse(c.launched_at)) / 86_400_000;
  // Claim today's run first: the scheduler and a manual run can't both act on the same campaign.
  const { data: claimed } = await db.from('ad_campaigns').update({ last_optimized_at: now.toISOString() }).eq('id', c.id)
    .or(`last_optimized_at.is.null,last_optimized_at.lt.${new Date(now.getTime() - 20 * 3600_000).toISOString()}`).select('id');
  if (!claimed?.length) return { actions: 0, note: 'already optimized today' };
  const plan = optimize({ mode: c.mode, goal: c.goal, daily_cap_cents: c.daily_cap_cents, age_days: age }, stats);
  const p = plan.actions.length ? await platformFor(c) : null;
  // Pauses and budget cuts first, raises after, so the total stays under the daily cap at every step.
  const ordered = [...plan.actions].sort((x, y) => (x.type === 'pause' ? 0 : x.type === 'budget' ? 1 : 2) - (y.type === 'pause' ? 0 : y.type === 'budget' ? 1 : 2));
  const current = new Map(ads.map((a) => [a.id, a.status === 'active' ? a.budget_cents : 0]));
  const budgetActs = ordered.filter((a): a is Extract<typeof a, { type: 'budget' }> => a.type === 'budget').sort((x, y) => (x.cents - (current.get(x.adId) ?? 0)) - (y.cents - (current.get(y.adId) ?? 0)));
  for (const act of [...ordered.filter((a) => a.type === 'pause'), ...budgetActs, ...ordered.filter((a) => a.type === 'refresh')]) {
    const a = ads.find((x) => x.id === act.adId)!;
    if (act.type === 'pause') {
      await p!.setStatus('ad', a.external_id!, false);
      await db.from('ads').update({ status: 'paused', pause_reason: act.reason, budget_cents: 0 }).eq('id', a.id);
      current.set(a.id, 0);
      await note(c, 'pause', act.reason, { ad: a.id });
    } else if (act.type === 'budget') {
      const others = [...current.entries()].filter(([id]) => id !== a.id).reduce((n, [, v]) => n + v, 0);
      if (act.cents > (current.get(a.id) ?? 0)) {
        const row = await gate(c, `ads:budget:${a.id}:${today(now)}:${act.cents}`, act.cents, others, { op: 'budget', ad_id: a.id, cents: act.cents });
        if (row.status !== 'executed') { await note(c, 'policy_block', `Budget change blocked: ${row.reason}`, { ad: a.id, actor: 'system' }); continue; }
      } else {
        await p!.setBudget(a.external_adset_id!, act.cents);
        await db.from('ads').update({ budget_cents: act.cents }).eq('id', a.id);
      }
      await note(c, 'shift_budget', `${money(current.get(a.id) ?? 0)} → ${money(act.cents)} a day. ${act.reason}`, { ad: a.id, amount: act.cents });
      current.set(a.id, act.cents);
    } else {
      await note(c, 'refresh', act.reason, { ad: a.id });
      await draftCreatives(c.id, 1, { refreshOf: a.id, auto: true }).catch(async (err) => note(c, 'sync_error', `Couldn’t draft a fresh ad: ${(err as Error).message}`, { actor: 'system' }));
    }
  }
  if (plan.actions.length) {
    await enqueue(c.workspace_id, 'notify', { kind: 'ad_autopilot', title: `Autopilot changed ${plan.actions.length} thing${plan.actions.length === 1 ? '' : 's'} in “${c.name}”`, body: plan.actions.map((x) => `- ${x.reason}`).join('\n').slice(0, 900), url: `${appUrl()}/app/${c.workspace_id}/ads` }, { key: `notify:autopilot:${c.id}:${today(now)}` });
  }
  return { actions: plan.actions.length, note: plan.note };
}

// ---------------------------------------------------------------- Conversions API (consented signups only)
/** Send a signup to Meta server-side, so attribution survives browser limits. Only consented events, only live. */
export async function sendConversion(workspaceId: string, e: { event_id: string; fbc?: string | null; fbp?: string | null; url?: string | null; email_sha256?: string | null; consent: string | null }) {
  if (e.consent !== 'granted') return { sent: false, reason: 'no consent' };
  const { data: s } = await db.from('ad_settings').select('meta_pixel_id').eq('workspace_id', workspaceId).maybeSingle();
  const token = await actionsRepo.getToken(workspaceId, 'meta');
  if (!s?.meta_pixel_id || !token || process.env.ACTIONS_MODE !== 'live') return { sent: false, reason: 'test mode or Meta not connected' };
  const res = await fetch(`https://graph.facebook.com/v21.0/${s.meta_pixel_id}/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ access_token: token, data: [{ event_name: 'CompleteRegistration', event_time: Math.floor(Date.now() / 1000), event_id: e.event_id, action_source: 'website', event_source_url: e.url ?? undefined, user_data: { ...(e.fbc ? { fbc: e.fbc } : {}), ...(e.fbp ? { fbp: e.fbp } : {}), ...(e.email_sha256 ? { em: [e.email_sha256] } : {}) } }] }),
  });
  if (!res.ok) throw new Error(`Conversions API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { sent: true };
}

/** A new campaign from the founder's settings: decide simulated vs live now, then draft creatives. */
export async function startCampaign(campaignId: string) {
  const c = await load(campaignId);
  const live = await canGoLive(c.workspace_id, c.platform);
  await db.from('ad_campaigns').update({ simulated: !live }).eq('id', c.id);
  await note(c, 'create', live ? 'Set up on your connected ad account' : 'Set up in test mode: everything runs on a simulator and no money moves. Connect your ad account to go live.', { actor: 'system' });
  return draftCreatives(c.id, 3);
}
