import { dunningExpired, trialReminderDue, winbackDue } from '@shipitloud/engine';
import { db, enqueue } from './db.ts';
import { appUrl } from './env.ts';

// Billing and retention housekeeping (PRD sections 24 and 25), every 10 minutes from the tick.
// Messages go through the founder's notification channels and are recorded once in lifecycle_messages.

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

async function dodoPatch(subId: string, body: Record<string, unknown>) {
  if (!process.env.DODO_API_KEY) return;
  const base = process.env.DODO_MODE === 'live' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';
  const res = await fetch(`${base}/subscriptions/${subId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${process.env.DODO_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Dodo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Records a founder message once; returns false if it was already sent. */
async function once(ws: string, type: string, key = '') {
  const { error } = await db.from('lifecycle_messages').insert({ workspace_id: ws, type, key });
  return !error;
}

async function message(ws: string, type: string, key: string, kind: string, title: string, body: string, path: string) {
  if (!(await once(ws, type, key))) return;
  await enqueue(ws, 'notify', { kind, title, body, url: `${appUrl()}${path}` }, { key: `notify:life:${ws}:${type}:${key}` });
}

async function toFree(ws: string, status: 'cancelled' | 'expired') {
  await db.from('subscriptions').update({ status, updated_at: iso(Date.now()) }).eq('workspace_id', ws);
  await db.from('workspaces').update({ plan: 'free' }).eq('id', ws);
}

export async function runBillingOps(now = Date.now()) {
  const { data: subs } = await db.from('subscriptions').select('workspace_id, plan, status, provider, provider_id, trial_ends_at, current_period_end, paused_until, past_due_since, reminded_at, updated_at').in('status', ['trialing', 'active', 'past_due', 'paused', 'cancelled']);
  for (const s of subs ?? []) {
    try {
      // Day 5 of 7: honest reminder with the date and a cancel link.
      if (trialReminderDue(s, now)) {
        await db.from('subscriptions').update({ reminded_at: iso(now) }).eq('workspace_id', s.workspace_id);
        const end = new Date(s.trial_ends_at!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        await message(s.workspace_id, 'trial_reminder', '', 'billing', `Your Grow trial ends on ${end}`, `Your card is charged $49 then, unless you cancel. Cancelling takes one click and keeps your plan and assets on Free.`, `/app/${s.workspace_id}/billing`);
      }
      // Dunning: 7 days of retries, then Free with nothing deleted.
      if (dunningExpired(s, now)) {
        if (s.provider === 'dodo' && s.provider_id) await dodoPatch(s.provider_id, { status: 'cancelled', cancel_reason: 'payment_failed' }).catch((e) => console.error('[billing] cancel after dunning', e.message));
        await toFree(s.workspace_id, 'cancelled');
        await message(s.workspace_id, 'dunning_downgrade', s.past_due_since ?? '', 'payment_failed', 'You’re on the Free plan now', 'We couldn’t take payment for 7 days, so your workspace moved to Free. Nothing was deleted: add a card and everything comes back.', `/app/${s.workspace_id}/billing`);
      }
      // Pause ends on its date.
      if (s.status === 'paused' && s.paused_until && Date.parse(s.paused_until) <= now) {
        if (s.provider === 'dodo' && s.provider_id) await dodoPatch(s.provider_id, { status: 'active' });
        await db.from('subscriptions').update({ status: 'active', paused_until: null, updated_at: iso(now) }).eq('workspace_id', s.workspace_id);
        await db.from('workspaces').update({ plan: s.plan }).eq('id', s.workspace_id);
        await message(s.workspace_id, 'pause_ended', s.paused_until, 'billing', 'Welcome back: your plan is running again', 'Listening, drafts and your weekly plan have picked up where they left off.', `/app/${s.workspace_id}`);
      }
      // Launch Pass: 30 days, then Free.
      if (s.plan === 'launch_pass' && s.status === 'active' && s.current_period_end && Date.parse(s.current_period_end) <= now) {
        await toFree(s.workspace_id, 'expired');
        await message(s.workspace_id, 'launch_pass_ended', '', 'billing', 'Your Launch Pass has ended', 'Your launch kit and plan stay. Keep the momentum with Grow, free for 7 days.', `/app/${s.workspace_id}/upgrade`);
      }
      // Win-back: 30 and 90 days after cancelling, with this week's numbers. Never more than two.
      if (s.status === 'cancelled') {
        const { data: sent } = await db.from('lifecycle_messages').select('type').eq('workspace_id', s.workspace_id).in('type', ['winback_30', 'winback_90']);
        const due = winbackDue(s.updated_at, (sent ?? []).map((m) => m.type), now);
        if (due) {
          const { count } = await db.from('mentions').select('id', { count: 'exact', head: true }).eq('workspace_id', s.workspace_id).gte('created_at', iso(now - 30 * DAY));
          await message(s.workspace_id, due, '', 'billing', count ? `${count} people asked for what you built this month` : 'Your growth plan is still here', count ? 'We kept listening on the Free plan. Come back and reply to them, with your first month at the same price.' : 'Everything you made is saved. Pick up where you left off.', `/app/${s.workspace_id}/upgrade`);
        }
      }
    } catch (err) {
      console.error('[billing]', s.workspace_id, err instanceof Error ? err.message : err);
    }
  }

  // Setup abandoned: a nudge after 1 hour and after 24 hours, with a resume link.
  const { data: fresh } = await db.from('workspaces').select('id, product_name, created_at').gte('created_at', iso(now - 2 * DAY)).lte('created_at', iso(now - 3600_000)).limit(200);
  for (const w of fresh ?? []) {
    const { data: prog } = await db.from('setup_progress').select('step, completed_at').eq('workspace_id', w.id);
    const done = (prog ?? []).filter((p) => p.completed_at);
    if (done.some((p) => p.step === 'live')) continue;
    const pct = Math.min(90, Math.round((done.length / 9) * 100));
    const age = now - Date.parse(w.created_at);
    const which = age >= DAY ? 'setup_nudge_24h' : 'setup_nudge_1h';
    await message(w.id, which, '', 'product', `Your growth plan is ${pct}% ready`, `Finish setting up ${w.product_name} in about 4 minutes. Your first posts and warm leads are waiting at the end.`, `/app/setup/${w.id}`);
  }

  // Inactive 7 days with drafts waiting: one nudge a week.
  const week = Math.floor(now / (7 * DAY));
  const { data: paid } = await db.from('workspaces').select('id').neq('plan', 'free').limit(500);
  for (const w of paid ?? []) {
    const { count: approvals } = await db.from('approvals').select('id', { count: 'exact', head: true }).eq('workspace_id', w.id).gte('decided_at', iso(now - 7 * DAY));
    if (approvals) continue;
    const { count: waiting } = await db.from('assets').select('id', { count: 'exact', head: true }).eq('workspace_id', w.id).eq('status', 'pending');
    if (!waiting) continue;
    const { count: expiring } = await db.from('assets').select('id', { count: 'exact', head: true }).eq('workspace_id', w.id).eq('status', 'pending').lte('expires_at', iso(now + 2 * DAY));
    await message(w.id, 'inactive_7d', String(week), 'pending_approval', `${waiting} drafts waiting${expiring ? `, ${expiring} expire soon` : ''}`, 'Approve the ones you like in a minute. Or turn on trust mode and the safe ones go out on their own.', `/app/${w.id}/inbox`);
  }

  // Account deletion: after the 7-day grace period the workspace and everything in it is deleted.
  const { data: dels } = await db.from('deletion_requests').select('workspace_id, requested_by').is('completed_at', null).is('cancelled_at', null).lte('scheduled_for', iso(now));
  for (const d of dels ?? []) {
    await db.from('admin_audit_log').insert({ admin_id: d.requested_by, action: 'workspace.deleted', target: d.workspace_id, detail: { grace_days: 7 } });
    await db.storage.from('assets').list(d.workspace_id).then(async ({ data }) => {
      const files = (data ?? []).map((f) => `${d.workspace_id}/${f.name}`);
      if (files.length) await db.storage.from('assets').remove(files);
    }).catch(() => undefined);
    await db.from('workspaces').delete().eq('id', d.workspace_id);
  }
}
