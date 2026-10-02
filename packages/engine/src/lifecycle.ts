// Signup-to-paid (PRD section 6 "Sales and conversion"): which lifecycle email a user should get, which paying
// users are going quiet, and checking what the founder's server sends us. Pure functions, tested on their own.
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from './db.ts';

export type LifecycleKind = 'welcome' | 'activation_nudge' | 'trial_ending' | 'upgrade_offer';
export const LIFECYCLE: LifecycleKind[] = ['welcome', 'activation_nudge', 'trial_ending', 'upgrade_offer'];
export type UserStatus = 'trial' | 'free' | 'paid' | 'churned';

export interface LifecycleUser {
  email: string | null; status: UserStatus; signed_up_at: string; activated_at: string | null;
  trial_ends_at: string | null; unsubscribed_at: string | null;
}

const H = 3_600_000;

/**
 * The one lifecycle email due for this user now, or null. Each kind goes once; the most time-sensitive wins when
 * several are due, the rest wait for the next run.
 *  - welcome: within 3 days of signing up
 *  - activation_nudge: 2 to 14 days in and still hasn't done the thing that means "got value" (after the welcome,
 *    unless they signed up too long ago to get one)
 *  - trial_ending: trial ends in the next 3 days and they haven't paid
 *  - upgrade_offer: on the free plan, activated, at least 7 days in
 */
export function dueLifecycle(u: LifecycleUser, o: { now: Date; sent: Set<string>; active: Set<string> }): LifecycleKind | null {
  if (!u.email || u.unsubscribed_at || u.status === 'churned') return null;
  const can = (k: LifecycleKind) => o.active.has(k) && !o.sent.has(k);
  const age = o.now.getTime() - Date.parse(u.signed_up_at);
  const paid = u.status === 'paid';
  if (can('trial_ending') && u.status === 'trial' && u.trial_ends_at) {
    const left = Date.parse(u.trial_ends_at) - o.now.getTime();
    if (left > 0 && left <= 72 * H) return 'trial_ending';
  }
  if (can('activation_nudge') && !paid && !u.activated_at && age >= 48 * H && age < 14 * 24 * H && (o.sent.has('welcome') || !o.active.has('welcome') || age >= 72 * H)) return 'activation_nudge';
  if (can('welcome') && age < 72 * H) return 'welcome';
  if (can('upgrade_offer') && u.status === 'free' && u.activated_at && age >= 7 * 24 * H) return 'upgrade_offer';
  return null;
}

/** A paying user is at risk when their activity fell by 60% or more, or they've been silent for 10 days. */
export function churnRisk(a: { recent: number; previous: number; last_event: string | null }, now = new Date()): { risk: boolean; reason: string } {
  const silent = a.last_event ? (now.getTime() - Date.parse(a.last_event)) / (24 * H) : Infinity;
  if (a.previous >= 4 && a.recent <= a.previous * 0.4) return { risk: true, reason: `Activity fell from ${a.previous} to ${a.recent} actions (last 14 days vs the 14 before)` };
  if (silent >= 10 && silent !== Infinity) return { risk: true, reason: `Not seen for ${Math.floor(silent)} days` };
  return { risk: false, reason: '' };
}

// ---------------------------------------------------------------- the server API
export interface TrackInput {
  user: { id: string; email?: string | null; name?: string | null; plan?: string | null; status?: UserStatus; trial_ends_at?: string | null; signed_up_at?: string | null };
  event: string | null;
  at: string | null;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const date = (v: unknown) => { if (typeof v !== 'string' && typeof v !== 'number') return null; const t = new Date(v).getTime(); return Number.isFinite(t) && t > Date.UTC(2000, 0, 1) && t < Date.now() + 400 * 24 * H ? new Date(t).toISOString() : null; };

/** Checks what the founder's server sent. Returns the cleaned input, or what's wrong with it. */
export function parseTrack(body: unknown): TrackInput | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Send a JSON object.' };
  const b = body as Record<string, unknown>;
  const u = (b.user && typeof b.user === 'object' ? b.user : null) as Record<string, unknown> | null;
  const id = str(u?.id ?? b.user_id, 120);
  if (!id) return { error: '"user.id" is required: your own id for this user.' };
  const email = u?.email == null ? undefined : str(u.email, 254);
  if (email !== undefined && email !== null && !EMAIL.test(email)) return { error: '"user.email" isn’t a valid email address.' };
  const status = u?.status == null ? undefined : (['trial', 'free', 'paid', 'churned'] as const).find((s) => s === u.status);
  if (u?.status != null && !status) return { error: '"user.status" must be one of trial, free, paid, churned.' };
  const event = str(b.event, 40);
  if (event && !/^[\w .:-]+$/.test(event)) return { error: '"event" may only use letters, numbers, spaces and . : _ -' };
  return {
    user: {
      id, ...(email !== undefined ? { email: email?.toLowerCase() ?? null } : {}),
      ...(u?.name != null ? { name: str(u.name, 80) } : {}), ...(u?.plan != null ? { plan: str(u.plan, 40) } : {}),
      ...(status ? { status } : {}), ...(u?.trial_ends_at !== undefined ? { trial_ends_at: date(u.trial_ends_at) } : {}),
      ...(u?.signed_up_at != null ? { signed_up_at: date(u.signed_up_at) } : {}),
    },
    event, at: date(b.at),
  };
}

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
/** A new secret API key: "sil_sk_" and 32 random characters. */
export function newApiKey() {
  const key = `sil_sk_${randomBytes(24).toString('base64url')}`;
  return { key, prefix: key.slice(0, 11), hash: hashKey(key) };
}

// ---------------------------------------------------------------- recording users and events

const PAID_EVENTS = new Set(['paid', 'subscribed', 'upgraded', 'purchase']);
const CHURN_EVENTS = new Set(['cancelled', 'canceled', 'churned', 'unsubscribed_plan']);

/**
 * Creates or updates one of the founder's users and records an event. `browser` calls (the snippet) can only
 * create users and add events; email, plan and status come from the founder's server with a secret key.
 */
export async function recordTrack(db: Db, workspaceId: string, t: TrackInput, o: { browser?: boolean; createIfMissing?: boolean } = {}) {
  const now = new Date().toISOString();
  const at = t.at ?? now;
  const { data: found } = await db.from('end_users').select('id, status, activated_at, paid_at').eq('workspace_id', workspaceId).eq('external_id', t.user.id).maybeSingle();
  let u = found as { id: string; status: UserStatus; activated_at: string | null; paid_at: string | null } | null;
  if (!u) {
    if (o.createIfMissing === false) return null;
    await db.from('end_users').upsert({ workspace_id: workspaceId, external_id: t.user.id, signed_up_at: t.user.signed_up_at ?? at }, { onConflict: 'workspace_id,external_id', ignoreDuplicates: true });
    u = (await db.from('end_users').select('id, status, activated_at, paid_at').eq('workspace_id', workspaceId).eq('external_id', t.user.id).single()).data as typeof u;
    if (!u) throw new Error('Could not save the user');
  }
  const patch: Record<string, unknown> = { updated_at: now, last_seen_at: at };
  if (!o.browser) {
    for (const k of ['email', 'name', 'plan', 'trial_ends_at', 'signed_up_at'] as const) if (k in t.user && t.user[k] !== undefined && !(k === 'signed_up_at' && !t.user[k])) patch[k] = t.user[k];
    if (t.user.status) patch.status = t.user.status;
  }
  const ev = t.event?.toLowerCase() ?? null;
  const { data: st } = await db.from('lifecycle_settings').select('activation_event').eq('workspace_id', workspaceId).maybeSingle();
  if (ev && !u.activated_at && ev === (st?.activation_event ?? 'activated').toLowerCase()) patch.activated_at = at;
  if (!o.browser && ev && PAID_EVENTS.has(ev)) patch.status = 'paid';
  if (!o.browser && ev && CHURN_EVENTS.has(ev)) patch.status = 'churned';
  if (patch.status === 'paid' && u.status !== 'paid') { patch.paid_at = u.paid_at ?? at; patch.churned_at = null; }
  if (patch.status === 'churned' && u.status !== 'churned') patch.churned_at = at;
  if (patch.status === 'paid' || patch.status === 'churned') patch.at_risk_at = null;
  const { error } = await db.from('end_users').update(patch).eq('id', u.id);
  if (error) throw new Error(error.message);
  if (ev) await db.from('user_events').insert({ workspace_id: workspaceId, end_user_id: u.id, event: ev, created_at: at });
  // Paying users mean churn alerts are worth running; make sure the settings row exists (defaults: alerts on).
  if (patch.status === 'paid') await db.from('lifecycle_settings').upsert({ workspace_id: workspaceId }, { onConflict: 'workspace_id', ignoreDuplicates: true });
  return { id: u.id, status: (patch.status as UserStatus | undefined) ?? u.status, activated: !!(patch.activated_at ?? u.activated_at) };
}
