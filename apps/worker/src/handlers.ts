import { runBillingOps } from './billing.ts';
import { decideTrust, deliver, execute, UNDO_WINDOW_MINUTES, type AssetType } from '@shipitloud/core';
import { actionsRepo, check, db, enqueue } from './db.ts';
import { appUrl } from './env.ts';
import { buildBrand } from './brand.ts';
import { makePosters } from './posters.ts';
import { PlanLimitError, makeLaunchPlan, makeLaunchPosts } from './launch.ts';
import { runReadiness } from './readiness.ts';
import { makeDemoVideo } from './video.ts';
import { NO_SHORTENER, draftReply, tagLinksInText, trackLinksInText, FREE_WINS } from '@shipitloud/engine';
import { pollWorkspace } from './listen.ts';
import { findKeywords, writeArticle } from './blog.ts';
import { findNicheFormats, makeCarousel, makeUgcVideo } from './ugc.ts';
import { licenceProblems } from './footage.ts';
import { draftBroadcast, draftWaitlistEmails, runSequence } from './emails.ts';
import { buildDigest, dueDigests } from './digests.ts';
import { auditLandingPage, draftNetworkKit } from './conversion.ts';
import { analyzeSetup, freeAnalysis, startFirstWins } from './setup.ts';
import { checkChurn, draftLifecycleEmails, runLifecycle } from './lifecycle.ts';
import { addAds, draftCreatives, launch as launchCampaign, optimizeCampaign, pauseAll, pauseCampaign, resume as resumeCampaign, sendConversion, startCampaign, sync as syncCampaign } from './ads/index.ts';
import { checkUpdates, learnVoice, makeContentWeek, postFromFormat, postsForUpdate, repurpose } from './content.ts';

export type Handler = (payload: Record<string, unknown>, job: { id: string; workspace_id: string | null }) => Promise<void>;

interface AssetRow {
  id: string;
  workspace_id: string;
  type: AssetType;
  platform: string | null;
  title: string;
  content: Record<string, unknown>;
  status: string;
  confidence: number | null;
  flags: string[];
  template_id: string | null;
  scheduled_for: string | null;
  undo_until: string | null;
  expires_at: string | null;
}

async function loadAsset(id: unknown): Promise<AssetRow> {
  if (typeof id !== 'string') throw new Error('asset_id missing');
  const a = check(await db.from('assets').select('*').eq('id', id).maybeSingle(), 'load asset');
  if (!a) throw new Error(`asset ${id} not found`);
  return a as AssetRow;
}

async function ownerOf(workspaceId: string) {
  const ws = check(await db.from('workspaces').select('owner_id, product_name').eq('id', workspaceId).single(), 'owner');
  return ws as { owner_id: string; product_name: string };
}

/** Queue a notification for the workspace owner (deduped by key). */
export async function notifyOwner(workspaceId: string, kind: string, title: string, body?: string, url?: string, key?: string) {
  await enqueue(workspaceId, 'notify', { kind, title, body, url }, { key: key ? `notify:${key}` : undefined });
}

async function planLimitNotice(ws: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (err) {
    if (err instanceof PlanLimitError) { await notifyOwner(ws, 'cap_reached', 'Plan limit reached', err.message, `${appUrl()}/pricing`); return; }
    throw err;
  }
}

export const handlers: Record<string, Handler> = {
  /** Launch kit posters: AI copy into designer templates, QA-gated, then into the inbox. */
  async 'kit.posters'(p, job) {
    if (!job.workspace_id) throw new Error('kit.posters needs a workspace');
    const r = await makePosters(job.workspace_id, { templates: Array.isArray(p.templates) ? (p.templates as string[]) : undefined });
    if (r.made) await notifyOwner(job.workspace_id, 'kit_ready', `${r.made} posters are ready for you`, 'Approve the ones you like.', `${appUrl()}/app/${job.workspace_id}/inbox`);
  },

  /** Launch posts for every channel, then the 30-day plan linked to them. */
  async 'kit.launch'(_p, job) {
    const ws = job.workspace_id!;
    try {
      const n = await makeLaunchPosts(ws);
      await makeLaunchPlan(ws);
      await notifyOwner(ws, 'kit_ready', `Your launch posts and 30-day plan are ready`, `${n} drafts are waiting for your OK.`, `${appUrl()}/app/${ws}/plan`);
    } catch (err) {
      if (err instanceof PlanLimitError) { await notifyOwner(ws, 'cap_reached', 'Plan limit reached', err.message, `${appUrl()}/pricing`); return; }
      throw err;
    }
  },

  /** Demo video: screenshots + script, rendered in three cuts. Takes a few minutes. */
  async 'kit.video'(_p, job) {
    const ws = job.workspace_id!;
    try {
      await makeDemoVideo(ws);
      await notifyOwner(ws, 'kit_ready', 'Your demo video is ready', 'Three cuts: 9:16, 1:1 and 16:9. Approve it in your inbox.', `${appUrl()}/app/${ws}/kit?tab=video`);
    } catch (err) {
      if (err instanceof PlanLimitError) { await notifyOwner(ws, 'cap_reached', 'Plan limit reached', err.message, `${appUrl()}/pricing`); return; }
      throw err;
    }
  },

  /** Listening: poll sources, score, auto-draft the best. `backfill` looks back 30 days (warm leads). */
  async 'listen.poll'(p, job) {
    const ws = job.workspace_id!;
    try {
      const r = await pollWorkspace(ws, { backfill: p.backfill === true });
      console.log(`[listen] ${ws} found ${r.found}, kept ${r.kept}, scored ${r.scored}, drafted ${r.drafted}`);
      if (p.backfill === true) {
        await notifyOwner(ws, 'listen_ready', `${r.kept} conversations found from the last 30 days`, r.drafted ? `${r.drafted} replies are drafted and waiting for you.` : 'Open Listening to see them.', `${appUrl()}/app/${ws}/listening`);
      } else if (r.drafted) {
        await notifyOwner(ws, 'listen_ready', `${r.drafted} new conversation${r.drafted === 1 ? '' : 's'} worth a reply`, 'Replies are drafted and waiting for your OK.', `${appUrl()}/app/${ws}/inbox`);
      }
    } catch (err) {
      if (err instanceof PlanLimitError) { await db.from('listen_configs').update({ active: false }).eq('workspace_id', ws); await notifyOwner(ws, 'cap_reached', 'Listening paused', err.message, `${appUrl()}/pricing`); return; }
      throw err;
    }
  },

  async 'listen.draft'(p, job) {
    try {
      await draftReply(db, job.workspace_id!, String(p.mention_id));
    } catch (err) {
      if (err instanceof PlanLimitError) { await notifyOwner(job.workspace_id!, 'cap_reached', 'Plan limit reached', err.message, `${appUrl()}/pricing`); return; }
      throw err;
    }
  },

  /** Content engine. Plan limits become a notice, not a retry loop. */
  async 'content.week'(_p, job) {
    const ws = job.workspace_id!;
    await planLimitNotice(ws, async () => {
      const n = await makeContentWeek(ws);
      await notifyOwner(ws, 'content_ready', `Next week is planned: ${n} posts`, 'Review them in your inbox. Each one is scheduled for its day.', `${appUrl()}/app/${ws}/content`);
    });
  },
  async 'content.from_format'(p, job) {
    await planLimitNotice(job.workspace_id!, () => postFromFormat(job.workspace_id!, String(p.slug), p.platform === 'linkedin' ? 'linkedin' : 'x', typeof p.topic === 'string' ? p.topic.slice(0, 500) : ''));
  },
  async 'content.repurpose'(p, job) {
    await planLimitNotice(job.workspace_id!, async () => {
      const r = await repurpose(job.workspace_id!, String(p.asset_id));
      if (r.skipped) console.log(`[repurpose] poster skipped: ${r.skipped}`);
    });
  },
  async 'content.voice'(_p, job) {
    await learnVoice(job.workspace_id!);
  },
  async 'content.check_updates'(_p, job) {
    await checkUpdates(job.workspace_id!);
  },
  async 'content.update_posts'(p, job) {
    const ws = job.workspace_id!;
    await planLimitNotice(ws, async () => {
      const n = await postsForUpdate(ws, String(p.update_id));
      if (n) await notifyOwner(ws, 'content_ready', 'You shipped something: posts are ready', 'We drafted an X post and a LinkedIn post about it.', `${appUrl()}/app/${ws}/inbox`);
    });
  },

  /** SEO blog: keyword ideas, then articles into the inbox. */
  async 'blog.keywords'(_p, job) {
    await planLimitNotice(job.workspace_id!, () => findKeywords(job.workspace_id!));
  },
  async 'blog.write'(p, job) {
    const ws = job.workspace_id!;
    await planLimitNotice(ws, async () => {
      const id = await writeArticle(ws, String(p.keyword_id));
      if (id) await notifyOwner(ws, 'content_ready', 'Your article is ready to read', 'Check it, fix anything marked [verify], then approve to publish.', `${appUrl()}/app/${ws}/blog/${id}`);
    });
  },

  /** UGC engine: formats for the niche, then videos (3 hook variants) and carousels. */
  async 'ugc.formats'(_p, job) {
    await planLimitNotice(job.workspace_id!, () => findNicheFormats(job.workspace_id!));
  },
  async 'ugc.video'(p, job) {
    const ws = job.workspace_id!;
    await planLimitNotice(ws, async () => {
      const r = await makeUgcVideo(ws, String(p.format_id), typeof p.topic === 'string' ? p.topic.slice(0, 300) : '');
      await notifyOwner(ws, 'content_ready', `${r.variants} video versions are ready`, 'Same video, three different hooks. Approve the ones you like.', `${appUrl()}/app/${ws}/content?tab=videos`);
    });
  },
  async 'ugc.carousel'(p, job) {
    const ws = job.workspace_id!;
    await planLimitNotice(ws, () => makeCarousel(ws, String(p.format_id), typeof p.topic === 'string' ? p.topic.slice(0, 300) : ''));
  },

  /** Waitlist emails: draft the sequence or a broadcast; send the sequence on schedule. */
  async 'email.draft_sequence'(_p, job) {
    const ws = job.workspace_id!;
    await planLimitNotice(ws, async () => {
      const n = await draftWaitlistEmails(ws);
      await notifyOwner(ws, 'content_ready', `${n} waitlist emails to review`, 'Approve them and they go out on their own: welcome, nudge, countdown and launch day.', `${appUrl()}/app/${ws}/inbox`);
    });
  },
  async 'email.draft_broadcast'(p, job) {
    await planLimitNotice(job.workspace_id!, () => draftBroadcast(job.workspace_id!, String(p.topic ?? '').slice(0, 300)));
  },
  async 'email.sequence'(_p, job) {
    const r = await runSequence(job.workspace_id!);
    if (r.sent) console.log(`[email] ${job.workspace_id} sequence: ${r.sent} emails`);
  },

  /** Signup-to-paid: draft the onboarding emails, send what's due, check paying users for churn. */
  async 'lifecycle.draft'(_p, job) {
    const ws = job.workspace_id!;
    await planLimitNotice(ws, async () => {
      await draftLifecycleEmails(ws);
      await notifyOwner(ws, 'content_ready', '4 onboarding emails to review', 'Approve them and they go to your users when each is due: welcome, activation nudge, trial ending, upgrade.', `${appUrl()}/app/${ws}/inbox`);
    });
  },
  async 'lifecycle.run'(_p, job) {
    const r = await runLifecycle(job.workspace_id!);
    if (r.sent) console.log(`[lifecycle] ${job.workspace_id}: ${r.sent} emails`);
  },
  async 'lifecycle.churn'(_p, job) {
    await planLimitNotice(job.workspace_id!, () => checkChurn(job.workspace_id!));
  },

  /** Ads autopilot: draft creatives, launch after approval, hourly sync with caps, daily optimizing, kill switch. */
  async 'ads.start'(p, job) {
    await planLimitNotice(job.workspace_id!, async () => {
      const n = await startCampaign(String(p.campaign_id));
      await notifyOwner(job.workspace_id!, 'content_ready', `${n} ads to review`, 'Approve the ones you like, then launch the campaign. Nothing spends before that.', `${appUrl()}/app/${job.workspace_id}/inbox`);
    });
  },
  async 'ads.launch'(p) { await launchCampaign(String(p.campaign_id)); },
  async 'ads.add'(p) { await addAds(String(p.campaign_id)); },
  async 'ads.sync'(p) { await syncCampaign(String(p.campaign_id)); },
  async 'ads.optimize'(p, job) { await planLimitNotice(job.workspace_id!, () => optimizeCampaign(String(p.campaign_id))); },
  async 'ads.kill'(_p, job) { await pauseAll(job.workspace_id!); },
  async 'ads.more'(p, job) { await planLimitNotice(job.workspace_id!, () => draftCreatives(String(p.campaign_id), 2)); },
  async 'ads.pause'(p) { await pauseCampaign(String(p.campaign_id), 'Paused by you', { actor: 'founder' }); },
  async 'ads.resume'(p) { await resumeCampaign(String(p.campaign_id), 'founder'); },
  async 'ads.capi'(p, job) {
    await sendConversion(job.workspace_id!, { event_id: String(p.event_id), fbc: (p.fbc as string) ?? null, fbp: (p.fbp as string) ?? null, url: (p.url as string) ?? null, consent: (p.consent as string) ?? null });
  },

  /** Landing page audit: the top fix for clarity, call to action and trust. */
  async 'kit.audit'(_p, job) {
    const ws = job.workspace_id!;
    const { data } = await db.from('workspaces').select('url').eq('id', ws).single();
    if (!data?.url) throw new Error('Add your site link in Settings first.');
    await planLimitNotice(ws, () => auditLandingPage(ws, data.url));
  },

  /** Personal launch messages for the founder's own network. */
  async 'kit.network'(_p, job) {
    const ws = job.workspace_id!;
    await planLimitNotice(ws, () => draftNetworkKit(ws));
  },

  async 'kit.readiness'(_p, job) {
    const ws = job.workspace_id!;
    const { data } = await db.from('workspaces').select('url').eq('id', ws).single();
    if (!data?.url) throw new Error('Add your site link in Settings first.');
    await runReadiness(ws, data.url);
  },

  async 'kit.plan'(_p, job) {
    await makeLaunchPlan(job.workspace_id!);
  },

  /** The 10-minute setup: understand the product, growth analysis, channel plan; then the first wins. */
  async 'setup.analyze'(p, job) { await analyzeSetup(job.workspace_id!, { analysisId: typeof p.analysis_id === 'string' ? p.analysis_id : undefined }); },
  async 'setup.wins'(_p, job) { await startFirstWins(job.workspace_id!); },
  async 'free.analysis'(p) { await freeAnalysis(String(p.id)); },

  /** Onboarding: crawl the site and draft the brand brain. */
  async 'brand.build'(_p, job) {
    if (!job.workspace_id) throw new Error('brand.build needs a workspace');
    await buildBrand(job.workspace_id);
  },

  /** A generator produced a draft: auto-approve under trust mode, or ask the founder. */
  async 'asset.intake'(p) {
    const a = await loadAsset(p.asset_id);
    if (a.status !== 'pending') return;
    const ws = check(await db.from('workspaces').select('trust_mode, trust_threshold, kill_switch').eq('id', a.workspace_id).single(), 'ws')!;

    // "Matches an approved template or topic": the founder has approved this kind of item before.
    let q = db.from('approvals').select('id, assets!inner(type, platform, template_id)', { count: 'exact', head: true })
      .eq('workspace_id', a.workspace_id).in('status', ['approved', 'edited']).eq('assets.type', a.type);
    if (a.platform) q = q.eq('assets.platform', a.platform);
    if (a.template_id) q = q.eq('assets.template_id', a.template_id);
    const { count } = await q;

    const decision = decideTrust(
      { type: a.type, platform: a.platform, confidence: a.confidence, flags: a.flags, scheduled: !!a.scheduled_for, matchesApprovedTopic: (count ?? 0) > 0 },
      ws,
    );
    if (decision.auto) {
      const undo = new Date(Date.now() + UNDO_WINDOW_MINUTES * 60_000).toISOString();
      check(await db.from('assets').update({ status: 'auto_approved', undo_until: undo, updated_at: new Date().toISOString() }).eq('id', a.id), 'auto approve');
      check(await db.from('approvals').insert({ workspace_id: a.workspace_id, asset_id: a.id, status: 'auto_approved', channel: 'system', note: decision.reason }), 'approval log');
      await enqueue(a.workspace_id, 'asset.decided', { asset_id: a.id }, { key: `decided:${a.id}:auto` });
      return;
    }
    await notifyOwner(a.workspace_id, 'pending_approval', `Needs you: ${a.title}`, decision.reason, `${appUrl()}/app/${a.workspace_id}/inbox`, `pending:${a.id}`);
  },

  /** Approved (by the founder or trust mode): schedule the publish job. */
  async 'asset.decided'(p) {
    const a = await loadAsset(p.asset_id);
    if (!['approved', 'auto_approved'].includes(a.status)) return;
    // Waitlist sequence emails are templates: approving one switches it on; the sequence runner sends it.
    if (a.type === 'email' && (a.content as { sequence?: boolean }).sequence) {
      await db.from('email_settings').upsert({ workspace_id: a.workspace_id, sequence_on: true }, { onConflict: 'workspace_id', ignoreDuplicates: true });
      return;
    }
    // Ad creatives don't publish on their own: they wait for the campaign launch, or join a running campaign.
    if (a.type === 'ad_creative') {
      const campaign = (a.content as { campaign_id?: string }).campaign_id;
      if (campaign) await enqueue(a.workspace_id, 'ads.add', { campaign_id: campaign }, { key: `adsadd:${campaign}:${a.id}` });
      return;
    }
    // Lifecycle emails too: approving one switches lifecycle emails on (unless the founder turned them off).
    if (a.type === 'email' && (a.content as { lifecycle?: boolean }).lifecycle) {
      await db.from('lifecycle_settings').upsert({ workspace_id: a.workspace_id, emails_on: true }, { onConflict: 'workspace_id', ignoreDuplicates: true });
      return;
    }
    const times = [Date.now(), a.scheduled_for ? Date.parse(a.scheduled_for) : 0, a.status === 'auto_approved' && a.undo_until ? Date.parse(a.undo_until) + 1000 : 0];
    await enqueue(a.workspace_id, 'asset.publish', { asset_id: a.id }, { runAt: new Date(Math.max(...times)), key: `publish:${a.id}` });
  },

  /** Every outbound action goes through the actions service. */
  async 'asset.publish'(p) {
    const a = await loadAsset(p.asset_id);
    if (!['approved', 'auto_approved'].includes(a.status)) return; // undone or rejected meanwhile
    // Free plan: 3 first wins. Beyond that the item stays approved and goes out once the founder upgrades.
    const { data: win } = await db.rpc('use_free_win', { p_workspace: a.workspace_id, p_limit: FREE_WINS });
    if (win === false) {
      await notifyOwner(a.workspace_id, 'cap_reached', 'Your 3 free first wins are used', 'This one is approved and waiting. Start Grow free for 7 days and it goes out right away.', `${appUrl()}/app/${a.workspace_id}/upgrade?reason=wins`, `wins:${a.workspace_id}`);
      return;
    }
    // Licence gate (PRD section 22): anything built from footage needs a commercial licence for every clip.
    const ugcId = (a.content as { ugc_video_id?: string }).ugc_video_id;
    if (ugcId) {
      const { data: v } = await db.from('ugc_videos').select('footage_sources, licence_ids').eq('id', ugcId).maybeSingle();
      const problems = v ? await licenceProblems(v.footage_sources ?? [], v.licence_ids ?? []) : ['The video record is missing'];
      if (problems.length) {
        await actionsRepo.insertAction({ workspace_id: a.workspace_id, asset_id: a.id, kind: 'post', provider: a.platform ?? 'copy', idempotency_key: `publish:${a.id}`, status: 'blocked', reason: `Unlicensed footage: ${problems.join('; ')}`.slice(0, 500), amount_cents: null, payload: {}, result: {} });
        await db.from('assets').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', a.id);
        await notifyOwner(a.workspace_id, 'failed', `Not posted: ${a.title}`, 'Some footage in it has no licence on record, so we stopped it. Remake the video.', `${appUrl()}/app/${a.workspace_id}/content?tab=videos`, `licence:${a.id}`);
        return;
      }
    }
    // Attribution: links to the product become tracked short links (or UTM-tagged real links where shorteners
    // get posts removed), so clicks and signups are credited to this channel. Stored back, so what's copied is tracked.
    let content = a.content as Record<string, unknown> & { text?: string; thread?: string[]; ref?: string };
    if (a.type !== 'article' && typeof content.text === 'string') {
      const { data: w } = await db.from('workspaces').select('url').eq('id', a.workspace_id).single();
      const source = a.platform ?? 'social';
      const campaign = (content.ref as string | undefined) ?? a.type;
      const track = (t: string) => NO_SHORTENER.has(source)
        ? Promise.resolve(tagLinksInText(t, w?.url ?? null, { source, medium: 'community', campaign }))
        : trackLinksInText(db, a.workspace_id, t, { productUrl: w?.url ?? null, base: appUrl(), source, campaign, assetId: a.id });
      const text = await track(content.text);
      const thread = Array.isArray(content.thread) ? await Promise.all(content.thread.map(track)) : undefined;
      if (text !== content.text) {
        content = { ...content, text, ...(thread ? { thread } : {}) };
        await db.from('assets').update({ content }).eq('id', a.id);
      }
    }
    const row = await execute(actionsRepo, {
      workspaceId: a.workspace_id,
      assetId: a.id,
      kind: a.type === 'email' ? 'send' : 'post',
      provider: a.platform ?? 'copy',
      payload: { ...content, title: a.title },
      idempotencyKey: `publish:${a.id}`,
    });
    if (row.status === 'copy_and_post') {
      await notifyOwner(a.workspace_id, 'ready_to_post', `Ready to post: ${a.title}`, 'Copy it and post in one tap.', `${appUrl()}/app/${a.workspace_id}/activity`, `ready:${a.id}`);
    } else if (row.status === 'failed') {
      await notifyOwner(a.workspace_id, 'failed', `Couldn't post: ${a.title}`, row.reason ?? undefined, `${appUrl()}/app/${a.workspace_id}/activity`, `failed:${a.id}`);
    }
  },

  /** Weekly digest or first 7 days report. Scheduled ones are sent; one asked for in the app just shows there. */
  async 'digest.build'(p, job) {
    if (!job.workspace_id) throw new Error('digest.build needs a workspace');
    await buildDigest(job.workspace_id, p.kind === 'first_week' ? 'first_week' : 'weekly', { notify: p.notify === true });
  },

  /** Store the notification and deliver it on the owner's channels. */
  async notify(p, job) {
    if (!job.workspace_id) throw new Error('notify needs a workspace');
    const { owner_id } = await ownerOf(job.workspace_id);
    const profile = check(await db.from('profiles').select('email, notification_prefs, timezone').eq('id', owner_id).single(), 'profile')!;
    const n = { title: String(p.title), body: p.body ? String(p.body) : undefined, url: p.url ? String(p.url) : undefined };
    const sent = await deliver({ to: { email: profile.email, prefs: profile.notification_prefs ?? {}, timezone: profile.timezone ?? 'UTC' }, kind: String(p.kind ?? 'info'), ...n });
    check(await db.from('notifications').insert({ workspace_id: job.workspace_id, user_id: owner_id, kind: String(p.kind ?? 'info'), ...n, channels: sent }), 'store notification');
  },
};

let lastDigestCheck = 0;
let lastBillingOps = 0;

/** Housekeeping that runs every minute: expiry, reminders, platform-warning fallback. */
export async function tick() {
  const now = new Date();
  // Billing and retention housekeeping every 10 minutes (PRD sections 24 and 25).
  if (now.getTime() - lastBillingOps > 10 * 60_000) {
    lastBillingOps = now.getTime();
    await runBillingOps(now.getTime()).catch((e) => console.error('[billing ops]', e instanceof Error ? e.message : e));
  }
  // Listening: poll each active workspace every 20 minutes. The key makes this idempotent per slot.
  const slot = Math.floor(now.getTime() / (20 * 60_000));
  const due = check(await db.from('listen_configs').select('workspace_id, last_polled_at').eq('active', true), 'listen due') as { workspace_id: string; last_polled_at: string | null }[];
  for (const c of due) {
    if (c.last_polled_at && now.getTime() - Date.parse(c.last_polled_at) < 19 * 60_000) continue;
    await enqueue(c.workspace_id, 'listen.poll', {}, { key: `poll:${c.workspace_id}:${slot}` });
  }

  // Content: check changelogs and GitHub releases every 6 hours.
  const sixH = Math.floor(now.getTime() / (6 * 3600_000));
  const sources = check(await db.from('content_sources').select('workspace_id, changelog_url, github_repo, last_checked_at, weekly_plan, last_planned_at'), 'content sources') as
    { workspace_id: string; changelog_url: string | null; github_repo: string | null; last_checked_at: string | null; weekly_plan: boolean; last_planned_at: string | null }[];
  for (const c of sources) {
    if ((c.changelog_url || c.github_repo) && (!c.last_checked_at || now.getTime() - Date.parse(c.last_checked_at) > 5.9 * 3600_000)) {
      await enqueue(c.workspace_id, 'content.check_updates', {}, { key: `updates:${c.workspace_id}:${sixH}` });
    }
    // Autopilot: plan next week on Sunday evening (UTC), at most once every 5 days.
    if (c.weekly_plan && now.getUTCDay() === 0 && now.getUTCHours() >= 17 && (!c.last_planned_at || now.getTime() - Date.parse(c.last_planned_at) > 5 * 86_400_000)) {
      await enqueue(c.workspace_id, 'content.week', {}, { key: `week:${c.workspace_id}:${now.toISOString().slice(0, 10)}` });
    }
  }

  // Lifecycle emails every 10 minutes where they're on; churn check once a day where there are paying users.
  const life = check(await db.from('lifecycle_settings').select('workspace_id, emails_on, churn_alerts, last_churn_check'), 'lifecycle') as { workspace_id: string; emails_on: boolean; churn_alerts: boolean; last_churn_check: string | null }[];
  const lifeSlot = Math.floor(now.getTime() / 600_000);
  for (const l of life) {
    if (l.emails_on) await enqueue(l.workspace_id, 'lifecycle.run', {}, { key: `life:${l.workspace_id}:${lifeSlot}` });
    if (l.churn_alerts && (!l.last_churn_check || now.getTime() - Date.parse(l.last_churn_check) > 23 * 3600_000)) {
      await enqueue(l.workspace_id, 'lifecycle.churn', {}, { key: `churn:${l.workspace_id}:${now.toISOString().slice(0, 10)}` });
    }
  }

  // Ads: sync spend hourly (caps and anomalies are checked there); optimize autopilot campaigns once a day.
  const hour = Math.floor(now.getTime() / 3600_000);
  const camps = check(await db.from('ad_campaigns').select('id, workspace_id, status, mode, last_synced_at, last_optimized_at, launched_at').in('status', ['active', 'paused']).not('launched_at', 'is', null), 'campaigns') as { id: string; workspace_id: string; status: string; mode: string; last_synced_at: string | null; last_optimized_at: string | null }[];
  for (const c of camps) {
    if (!c.last_synced_at || now.getTime() - Date.parse(c.last_synced_at) > 55 * 60_000) await enqueue(c.workspace_id, 'ads.sync', { campaign_id: c.id }, { key: `adsync:${c.id}:${hour}` });
    if (c.status === 'active' && c.mode === 'autopilot' && (!c.last_optimized_at || now.getTime() - Date.parse(c.last_optimized_at) > 23 * 3600_000)) {
      await enqueue(c.workspace_id, 'ads.optimize', { campaign_id: c.id }, { key: `adopt:${c.id}:${now.toISOString().slice(0, 10)}` });
    }
  }

  // The growth analysis re-runs monthly (PRD section 23), checked once an hour.
  if (now.getUTCMinutes() < 2) {
    const stale = check(await db.from('growth_analyses').select('workspace_id, created_at').eq('status', 'ready').lt('created_at', new Date(now.getTime() - 30 * 86_400_000).toISOString()).limit(200), 'stale analyses') as { workspace_id: string; created_at: string }[];
    const fresh = new Set((check(await db.from('growth_analyses').select('workspace_id').gte('created_at', new Date(now.getTime() - 30 * 86_400_000).toISOString()), 'fresh') as { workspace_id: string }[]).map((r) => r.workspace_id));
    for (const s of stale) if (!fresh.has(s.workspace_id)) await enqueue(s.workspace_id, 'setup.analyze', {}, { key: `monthly:${s.workspace_id}:${now.toISOString().slice(0, 7)}` });
  }

  // Waitlist sequence: check every 10 minutes for workspaces that switched it on.
  const tenMin = Math.floor(now.getTime() / 600_000);
  const seq = check(await db.from('email_settings').select('workspace_id').eq('sequence_on', true), 'sequences') as { workspace_id: string }[];
  for (const s of seq) await enqueue(s.workspace_id, 'email.sequence', {}, { key: `seq:${s.workspace_id}:${tenMin}` });

  // Digests: Monday morning where the founder lives, and the first 7 days report once. Checked every 15 minutes.
  if (now.getTime() - lastDigestCheck >= 15 * 60_000) {
    lastDigestCheck = now.getTime();
    for (const d of await dueDigests(now)) await enqueue(d.ws, 'digest.build', { kind: d.kind, notify: true }, { key: d.key });
  }

  // Expire pending items whose moment has passed.
  check(await db.from('assets').update({ status: 'expired' }).eq('status', 'pending').lt('expires_at', now.toISOString()), 'expire');

  // Remind once when a pending item expires within 2 hours.
  const soon = check(
    await db.from('assets').select('id, workspace_id, title, expires_at').eq('status', 'pending')
      .gt('expires_at', now.toISOString()).lt('expires_at', new Date(now.getTime() + 2 * 3600_000).toISOString()),
    'expiring',
  ) as { id: string; workspace_id: string; title: string }[];
  for (const a of soon) {
    await notifyOwner(a.workspace_id, 'expiring_soon', `Expires soon: ${a.title}`, 'Approve it before the conversation moves on.', `${appUrl()}/app/${a.workspace_id}/inbox`, `expiring:${a.id}`);
  }

  // A platform warning or restriction drops the workspace back to Manual.
  const warned = check(await db.from('connections').select('workspace_id, provider').in('status', ['warned', 'restricted']), 'warned') as { workspace_id: string; provider: string }[];
  for (const c of warned) {
    const { data } = await db.from('workspaces').update({ trust_mode: 'manual', trust_dropped_at: now.toISOString(), trust_dropped_reason: `${c.provider} warned or restricted the account` })
      .eq('id', c.workspace_id).neq('trust_mode', 'manual').select('id');
    if (data?.length) {
      await notifyOwner(c.workspace_id, 'trust_dropped', 'Switched back to Manual', `${c.provider} warned your account, so everything now needs your approval.`, `${appUrl()}/app/${c.workspace_id}/settings`);
    }
  }
}
