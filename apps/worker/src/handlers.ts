import { decideTrust, deliver, execute, UNDO_WINDOW_MINUTES, type AssetType } from '@shipitloud/core';
import { actionsRepo, check, db, enqueue } from './db.ts';
import { appUrl } from './env.ts';
import { buildBrand } from './brand.ts';
import { makePosters } from './posters.ts';
import { PlanLimitError, makeLaunchPlan, makeLaunchPosts } from './launch.ts';
import { runReadiness } from './readiness.ts';
import { makeDemoVideo } from './video.ts';
import { NO_SHORTENER, draftReply, tagLinksInText, trackLinksInText } from '@shipitloud/engine';
import { pollWorkspace } from './listen.ts';
import { findKeywords, writeArticle } from './blog.ts';
import { findNicheFormats, makeCarousel, makeUgcVideo } from './ugc.ts';
import { licenceProblems } from './footage.ts';
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

  async 'kit.readiness'(_p, job) {
    const ws = job.workspace_id!;
    const { data } = await db.from('workspaces').select('url').eq('id', ws).single();
    if (!data?.url) throw new Error('Add your site link in Settings first.');
    await runReadiness(ws, data.url);
  },

  async 'kit.plan'(_p, job) {
    await makeLaunchPlan(job.workspace_id!);
  },

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
    const times = [Date.now(), a.scheduled_for ? Date.parse(a.scheduled_for) : 0, a.status === 'auto_approved' && a.undo_until ? Date.parse(a.undo_until) + 1000 : 0];
    await enqueue(a.workspace_id, 'asset.publish', { asset_id: a.id }, { runAt: new Date(Math.max(...times)), key: `publish:${a.id}` });
  },

  /** Every outbound action goes through the actions service. */
  async 'asset.publish'(p) {
    const a = await loadAsset(p.asset_id);
    if (!['approved', 'auto_approved'].includes(a.status)) return; // undone or rejected meanwhile
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

  /** Store the notification and deliver it on the owner's channels. */
  async notify(p, job) {
    if (!job.workspace_id) throw new Error('notify needs a workspace');
    const { owner_id } = await ownerOf(job.workspace_id);
    const profile = check(await db.from('profiles').select('email, notification_prefs').eq('id', owner_id).single(), 'profile')!;
    const n = { title: String(p.title), body: p.body ? String(p.body) : undefined, url: p.url ? String(p.url) : undefined };
    const sent = await deliver({ to: { email: profile.email, prefs: profile.notification_prefs ?? {} }, ...n });
    check(await db.from('notifications').insert({ workspace_id: job.workspace_id, user_id: owner_id, kind: String(p.kind ?? 'info'), ...n, channels: sent }), 'store notification');
  },
};

/** Housekeeping that runs every minute: expiry, reminders, platform-warning fallback. */
export async function tick() {
  const now = new Date();
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
