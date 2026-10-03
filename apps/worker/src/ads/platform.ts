// One interface for every ad platform (PRD build rules: every integration behind an interface with a mock).
// Meta and Google are written against their public APIs and switch on once the app reviews land; until then, and
// always outside live mode, campaigns run on the simulator: no real platform, no real money.
import { simulateDay } from '@shipitloud/engine';

export interface CreativeInput { name: string; headline: string; primary_text: string; description: string; cta: string; image_url: string | null; link: string }
export interface CampaignInput { name: string; goal: 'signups' | 'traffic' | 'installs'; regions: string[]; special_category: string | null; total_cap_cents: number }
export interface AdRef { key: string; external_id: string | null; adset_id: string | null; budget_cents: number; status: string }
export interface DayStats { spend_cents: number; impressions: number; clicks: number; conversions: number }

export interface AdPlatform {
  simulated: boolean;
  createCampaign(c: CampaignInput): Promise<{ id: string }>;
  /** One ad set per ad (so budgets can move between ads), created paused; returns both ids. */
  createAd(campaignId: string, c: CampaignInput, ad: CreativeInput, budgetCents: number): Promise<{ adId: string; adsetId: string }>;
  setBudget(adsetId: string, cents: number): Promise<void>;
  setStatus(kind: 'campaign' | 'ad', id: string, on: boolean): Promise<void>;
  insights(ad: AdRef, day: string, fractionOfDay: number): Promise<DayStats>;
}

// ---------------------------------------------------------------- simulator (test mode)
export function simulator(o: { overspend?: number } = {}): AdPlatform {
  const id = (p: string) => `sim_${p}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    simulated: true,
    async createCampaign() { return { id: id('cmp') }; },
    async createAd() { return { adId: id('ad'), adsetId: id('set') }; },
    async setBudget() {},
    async setStatus() {},
    async insights(ad, day, fraction) {
      // Only today's running ads spend; an ad paused today keeps what it spent before the pause (sync stores it).
      if (ad.status !== 'active') return { spend_cents: 0, impressions: 0, clicks: 0, conversions: 0 };
      return simulateDay(ad.key, day, ad.budget_cents, fraction, o.overspend ?? 1);
    },
  };
}

// ---------------------------------------------------------------- Meta Marketing API
const GRAPH = 'https://graph.facebook.com/v21.0';
const OBJECTIVE = { signups: 'OUTCOME_LEADS', traffic: 'OUTCOME_TRAFFIC', installs: 'OUTCOME_APP_PROMOTION' } as const;
const SPECIAL = { credit: 'CREDIT', employment: 'EMPLOYMENT', housing: 'HOUSING', social_issues: 'ISSUES_ELECTIONS_POLITICS' } as Record<string, string>;
const CONVERSION_ACTIONS = new Set(['offsite_conversion.fb_pixel_complete_registration', 'complete_registration', 'lead', 'offsite_conversion.fb_pixel_lead', 'mobile_app_install', 'app_install']);

export function meta(o: { token: string; adAccount: string; pageId: string; pixelId: string | null }): AdPlatform {
  const act = o.adAccount.startsWith('act_') ? o.adAccount : `act_${o.adAccount}`;
  async function call(path: string, params: Record<string, unknown>, method: 'POST' | 'GET' = 'POST') {
    const body = new URLSearchParams({ access_token: o.token });
    for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    const url = method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
    const res = await fetch(url, { method, body: method === 'POST' ? body : undefined, signal: AbortSignal.timeout(30_000) });
    const j = (await res.json()) as { id?: string; error?: { message: string }; data?: unknown[] };
    if (!res.ok || j.error) throw new Error(`Meta: ${j.error?.message ?? res.status}`);
    return j;
  }
  return {
    simulated: false,
    async createCampaign(c) {
      // Created paused, with a lifetime spend cap as a second, platform-side guard behind our own caps.
      const j = await call(`${act}/campaigns`, { name: c.name, objective: OBJECTIVE[c.goal], status: 'PAUSED', buying_type: 'AUCTION', special_ad_categories: c.special_category ? [SPECIAL[c.special_category]] : [], spend_cap: String(c.total_cap_cents) });
      return { id: j.id! };
    },
    async createAd(campaignId, c, ad, budgetCents) {
      const conv = c.goal !== 'traffic' && o.pixelId;
      const set = await call(`${act}/adsets`, {
        name: `${ad.name} · set`, campaign_id: campaignId, daily_budget: String(budgetCents), billing_event: 'IMPRESSIONS', status: 'PAUSED',
        optimization_goal: c.goal === 'traffic' ? 'LINK_CLICKS' : c.goal === 'installs' ? 'APP_INSTALLS' : conv ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS',
        ...(conv ? { promoted_object: { pixel_id: o.pixelId, custom_event_type: 'COMPLETE_REGISTRATION' } } : {}),
        // Special categories: Meta forbids narrowing by age, gender or postcode, so only countries are set.
        targeting: { geo_locations: { countries: c.regions }, ...(c.special_category ? {} : { age_min: 18 }) },
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      });
      const creative = await call(`${act}/adcreatives`, {
        name: ad.name,
        object_story_spec: { page_id: o.pageId, link_data: { link: ad.link, message: ad.primary_text, name: ad.headline, description: ad.description, ...(ad.image_url ? { picture: ad.image_url } : {}), call_to_action: { type: ad.cta, value: { link: ad.link } } } },
      });
      const a = await call(`${act}/ads`, { name: ad.name, adset_id: set.id, creative: { creative_id: creative.id }, status: 'PAUSED' });
      return { adId: a.id!, adsetId: set.id! };
    },
    async setBudget(adsetId, cents) { await call(adsetId, { daily_budget: String(cents) }); },
    async setStatus(_kind, id, on) { await call(id, { status: on ? 'ACTIVE' : 'PAUSED' }); },
    async insights(ad, day) {
      if (!ad.external_id) return { spend_cents: 0, impressions: 0, clicks: 0, conversions: 0 };
      const j = await call(`${ad.external_id}/insights`, { time_range: { since: day, until: day }, fields: 'spend,impressions,inline_link_clicks,actions' }, 'GET');
      const row = (j.data?.[0] ?? {}) as { spend?: string; impressions?: string; inline_link_clicks?: string; actions?: { action_type: string; value: string }[] };
      return {
        spend_cents: Math.round(Number(row.spend ?? 0) * 100), impressions: Number(row.impressions ?? 0), clicks: Number(row.inline_link_clicks ?? 0),
        conversions: (row.actions ?? []).filter((a) => CONVERSION_ACTIONS.has(a.action_type)).reduce((n, a) => n + Number(a.value), 0),
      };
    },
  };
}

// ---------------------------------------------------------------- Google Ads API (search)
// Google has no per-ad budgets, so each of our ads is its own small search campaign with its own daily budget:
// caps and budget moves then map exactly. The "campaign" on our side is just a label.
const GADS = 'https://googleads.googleapis.com/v18';
export function google(o: { token: string; customerId: string; developerToken: string; loginCustomerId?: string | null }): AdPlatform {
  const cid = o.customerId.replace(/-/g, '');
  async function call(path: string, body: unknown) {
    const res = await fetch(`${GADS}/customers/${cid}/${path}`, {
      method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${o.token}`, 'developer-token': o.developerToken, 'content-type': 'application/json', ...(o.loginCustomerId ? { 'login-customer-id': o.loginCustomerId.replace(/-/g, '') } : {}) },
    });
    const j = (await res.json()) as { results?: { resourceName: string }[]; error?: { message: string } } & Record<string, unknown>;
    if (!res.ok || j.error) throw new Error(`Google Ads: ${j.error?.message ?? res.status}`);
    return j;
  }
  const micros = (cents: number) => String(cents * 10_000);
  const first = (j: { results?: { resourceName: string }[] }) => j.results![0]!.resourceName;
  return {
    simulated: false,
    async createCampaign(c) { return { id: `label:${c.name}` }; },
    async createAd(_campaignId, c, ad, budgetCents) {
      const budget = first(await call('campaignBudgets:mutate', { operations: [{ create: { name: `${ad.name} ${Date.now()}`, amountMicros: micros(budgetCents), deliveryMethod: 'STANDARD', explicitlyShared: false } }] }));
      const campaign = first(await call('campaigns:mutate', { operations: [{ create: { name: `${c.name} · ${ad.name}`.slice(0, 120), status: 'PAUSED', advertisingChannelType: 'SEARCH', campaignBudget: budget, maximizeClicks: {}, networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false } } }] }));
      if (c.regions.length) await call('campaignCriteria:mutate', { operations: c.regions.map((r) => ({ create: { campaign, location: { geoTargetConstant: `geoTargetConstants/${GEO[r] ?? r}` } } })) });
      const group = first(await call('adGroups:mutate', { operations: [{ create: { name: ad.name, campaign, status: 'ENABLED', type: 'SEARCH_STANDARD' } }] }));
      const headlines = [ad.headline, ad.description, ad.name].map((t) => t.slice(0, 30)).filter((t, i, a) => t && a.indexOf(t) === i);
      await call('adGroupAds:mutate', { operations: [{ create: { adGroup: group, status: 'ENABLED', ad: { finalUrls: [ad.link], responsiveSearchAd: { headlines: headlines.map((text) => ({ text })), descriptions: [ad.primary_text, ad.description].map((t) => ({ text: t.slice(0, 90) })) } } } }] });
      return { adId: campaign, adsetId: budget };
    },
    async setBudget(budget, cents) { await call('campaignBudgets:mutate', { operations: [{ update: { resourceName: budget, amountMicros: micros(cents) }, updateMask: 'amount_micros' }] }); },
    async setStatus(kind, id, on) {
      if (kind === 'campaign') return;   // our campaign is a label; each ad's own campaign is paused individually
      await call('campaigns:mutate', { operations: [{ update: { resourceName: id, status: on ? 'ENABLED' : 'PAUSED' }, updateMask: 'status' }] });
    },
    async insights(ad, day) {
      if (!ad.external_id) return { spend_cents: 0, impressions: 0, clicks: 0, conversions: 0 };
      const j = await call('googleAds:search', { query: `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE campaign.resource_name = '${ad.external_id}' AND segments.date = '${day}'` });
      const m = ((j.results ?? []) as unknown as { metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number } }[])[0]?.metrics ?? {};
      return { spend_cents: Math.round(Number(m.costMicros ?? 0) / 10_000), impressions: Number(m.impressions ?? 0), clicks: Number(m.clicks ?? 0), conversions: Math.round(Number(m.conversions ?? 0)) };
    },
  };
}
// Google's geo target ids for the markets we sell in (PRD: US, UK and Europe first).
const GEO: Record<string, string> = { US: '2840', GB: '2826', CA: '2124', AU: '2036', IE: '2372', DE: '2276', FR: '2250', NL: '2528', ES: '2724', IT: '2380', SE: '2752', NG: '2566' };
