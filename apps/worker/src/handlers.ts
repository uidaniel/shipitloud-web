import { decideTrust, deliver, execute, UNDO_WINDOW_MINUTES, type AssetType } from '@shipitloud/core';
import { actionsRepo, check, db, enqueue } from './db.ts';
import { appUrl } from './env.ts';
import { buildBrand } from './brand.ts';

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

export const handlers: Record<string, Handler> = {
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
    const row = await execute(actionsRepo, {
      workspaceId: a.workspace_id,
      assetId: a.id,
      kind: a.type === 'email' ? 'send' : 'post',
      provider: a.platform ?? 'copy',
      payload: { ...a.content, title: a.title },
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
