'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser, requireWorkspace } from '@/lib/supabase/server';

const str = (v: FormDataEntryValue | null, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function normalizeUrl(input: string): string | null {
  if (!input) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return u.hostname.includes('.') ? u.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

async function enqueue(sb: Awaited<ReturnType<typeof requireUser>>['sb'], ws: string, type: string, payload: Record<string, unknown>, key?: string) {
  const { error } = await sb.rpc('enqueue_job', { p_workspace: ws, p_type: type, p_payload: payload, p_run_at: new Date().toISOString(), p_key: key ?? null });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- workspaces
export async function createWorkspace(_: unknown, form: FormData): Promise<{ error?: string }> {
  const { sb, user } = await requireUser();
  const name = str(form.get('product_name'), 80);
  const rawUrl = str(form.get('url'), 300);
  const url = normalizeUrl(rawUrl);
  if (!name) return { error: 'Give your product a name.' };
  if (rawUrl && !url) return { error: 'That link doesn’t look right. Try something like yourproduct.com' };
  const { data, error } = await sb.from('workspaces').insert({ owner_id: user.id, product_name: name, url }).select('id').single();
  if (error || !data) return { error: 'Couldn’t create your workspace. Try again.' };
  await Promise.all([
    sb.from('brand_brains').insert({ workspace_id: data.id, status: url ? 'building' : 'idle' }),
    sb.from('brand_kits').insert({ workspace_id: data.id }),
    sb.from('voice_profiles').insert({ workspace_id: data.id }),
  ]);
  if (url) await enqueue(sb, data.id, 'brand.build', {}, `brand:${data.id}:1`);
  redirect(`/app/setup/${data.id}`);
}

// ---------------------------------------------------------------- approvals
async function logApprovalTime(sb: Awaited<ReturnType<typeof requireUser>>['sb'], ws: string, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const date = new Date().toISOString().slice(0, 10);
  const add = Math.min(Math.round(seconds), 600);
  const { data } = await sb.from('approval_time_log').select('seconds_spent').eq('workspace_id', ws).eq('date', date).maybeSingle();
  await sb.from('approval_time_log').upsert({ workspace_id: ws, date, seconds_spent: (data?.seconds_spent ?? 0) + add });
}

export async function decide(form: FormData) {
  const wsId = str(form.get('ws'));
  const assetId = str(form.get('asset'));
  const decision = str(form.get('decision'));
  const { sb, user } = await requireWorkspace(wsId);
  const { data: asset } = await sb.from('assets').select('id, status, content').eq('id', assetId).eq('workspace_id', wsId).maybeSingle();
  if (!asset || asset.status !== 'pending') return;

  const now = new Date().toISOString();
  if (decision === 'reject') {
    await sb.from('assets').update({ status: 'rejected', updated_at: now }).eq('id', assetId);
    await sb.from('approvals').insert({ workspace_id: wsId, asset_id: assetId, status: 'rejected', decided_by: user.id });
  } else if (decision === 'approve' || decision === 'edit') {
    const edited = decision === 'edit' ? str(form.get('text'), 20000) : '';
    const content = edited ? { ...(asset.content as object), text: edited } : asset.content;
    await sb.from('assets').update({ status: 'approved', content, updated_at: now }).eq('id', assetId);
    await sb.from('approvals').insert({ workspace_id: wsId, asset_id: assetId, status: edited ? 'edited' : 'approved', decided_by: user.id });
    await enqueue(sb, wsId, 'asset.decided', { asset_id: assetId }, `decided:${assetId}:human`);
  }
  await logApprovalTime(sb, wsId, Number(form.get('seconds')));
  revalidatePath(`/app/${wsId}`, 'layout');
}

export async function approveAll(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb, user } = await requireWorkspace(wsId);
  const ids = str(form.get('ids'), 10000).split(',').filter(Boolean);
  for (const id of ids) {
    const { data } = await sb.from('assets').update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id).eq('workspace_id', wsId).eq('status', 'pending').select('id');
    if (!data?.length) continue;
    await sb.from('approvals').insert({ workspace_id: wsId, asset_id: id, status: 'approved', decided_by: user.id });
    await enqueue(sb, wsId, 'asset.decided', { asset_id: id }, `decided:${id}:human`);
  }
  revalidatePath(`/app/${wsId}`, 'layout');
}

/** Pull an auto-approved item back before it goes out. */
export async function undo(form: FormData) {
  const wsId = str(form.get('ws'));
  const assetId = str(form.get('asset'));
  const { sb, user } = await requireWorkspace(wsId);
  const { data } = await sb.from('assets').update({ status: 'pending', undo_until: null, updated_at: new Date().toISOString() })
    .eq('id', assetId).eq('workspace_id', wsId).eq('status', 'auto_approved').gt('undo_until', new Date().toISOString()).select('id');
  if (data?.length) await sb.from('approvals').insert({ workspace_id: wsId, asset_id: assetId, status: 'undone', decided_by: user.id });
  revalidatePath(`/app/${wsId}`, 'layout');
}

/** Copy-and-post items: the founder confirms they posted it. */
export async function markPosted(form: FormData) {
  const wsId = str(form.get('ws'));
  const assetId = str(form.get('asset'));
  const { sb } = await requireWorkspace(wsId);
  await sb.from('assets').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', assetId).eq('workspace_id', wsId).eq('status', 'scheduled');
  revalidatePath(`/app/${wsId}`, 'layout');
}

// ---------------------------------------------------------------- settings
export async function saveAutomation(_: unknown, form: FormData): Promise<{ ok?: boolean; error?: string }> {
  const wsId = str(form.get('ws'));
  const { sb, ws } = await requireWorkspace(wsId);
  const mode = str(form.get('trust_mode'));
  if (!['manual', 'trust', 'full'].includes(mode)) return { error: 'Pick a mode.' };
  const threshold = Math.max(50, Math.min(100, Number(form.get('trust_threshold')) || 85));
  const patch: Record<string, unknown> = { trust_mode: mode, trust_threshold: threshold };
  if (mode !== ws.trust_mode && mode !== 'manual') { patch.trust_dropped_at = null; patch.trust_dropped_reason = null; }
  const { error } = await sb.from('workspaces').update(patch).eq('id', wsId);
  revalidatePath(`/app/${wsId}`, 'layout');
  return error ? { error: 'Couldn’t save. Try again.' } : { ok: true };
}

export async function setKillSwitch(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await sb.from('workspaces').update({ kill_switch: form.get('on') === 'true' }).eq('id', wsId);
  revalidatePath(`/app/${wsId}`, 'layout');
}

export async function saveProduct(_: unknown, form: FormData): Promise<{ ok?: boolean; error?: string }> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const name = str(form.get('product_name'), 80);
  const rawUrl = str(form.get('url'));
  const url = normalizeUrl(rawUrl);
  const launch = str(form.get('launch_date'), 10);
  if (!name) return { error: 'Your product needs a name.' };
  if (rawUrl && !url) return { error: 'That link doesn’t look right.' };
  const { error } = await sb.from('workspaces').update({ product_name: name, url, launch_date: launch || null }).eq('id', wsId);
  revalidatePath(`/app/${wsId}`, 'layout');
  return error ? { error: 'Couldn’t save. Try again.' } : { ok: true };
}

export async function saveNotifications(_: unknown, form: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { sb, user } = await requireUser();
  const hook = str(form.get('slack_webhook'), 500);
  if (hook && !/^https:\/\/hooks\.slack\.com\//.test(hook)) return { error: 'Slack webhooks start with https://hooks.slack.com/' };
  const prefs = { email: form.get('email') === 'on', slack: form.get('slack') === 'on' && !!hook, slack_webhook: hook || undefined, push: false, whatsapp: false };
  const { error } = await sb.from('profiles').update({ notification_prefs: prefs }).eq('id', user.id);
  revalidatePath('/app', 'layout');
  return error ? { error: 'Couldn’t save. Try again.' } : { ok: true };
}

export async function markNotificationsRead() {
  const { sb, user } = await requireUser();
  await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null);
  revalidatePath('/app', 'layout');
}

export async function signOut() {
  const { sb } = await requireUser();
  await sb.auth.signOut();
  redirect('/login');
}

// ---------------------------------------------------------------- dev helper
/** Creates a few example drafts so the inbox can be tried before generators exist. Never in production. */
export async function addExampleDrafts(form: FormData) {
  if (process.env.NODE_ENV === 'production') return;
  const wsId = str(form.get('ws'));
  const { sb, ws } = await requireWorkspace(wsId);
  const name = ws.product_name;
  const soon = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
  const rows = [
    { type: 'reply', platform: 'hn', title: 'Reply: “How did you get your first 100 users?”', confidence: 93, expires_at: soon(6),
      content: { text: `Same question kept me up for weeks. What worked for us: talk to 20 people who already have the problem before posting anywhere. Happy to share the exact messages we used with ${name}.`, thread_url: 'https://news.ycombinator.com/' } },
    { type: 'post', platform: 'x', title: 'Launch thread, post 1', confidence: 91, scheduled_for: soon(20),
      content: { text: `We built ${name} because launching shouldn’t take longer than building.\n\nHere’s what it does, in 4 posts 🧵` } },
    { type: 'post', platform: 'linkedin', title: 'Founder story', confidence: 88, scheduled_for: soon(26),
      content: { text: `Six months ago I finished building ${name}. Then nothing happened.\n\nThis is what I learned about getting the first users.` } },
    { type: 'email', platform: 'email', title: 'Welcome email to the waitlist', confidence: 90,
      content: { text: `Thanks for joining the ${name} waitlist. You’re in early.\n\nShare your link to move up the list.` } },
  ].map((r) => ({ ...r, workspace_id: wsId, template_id: 'example', prompt_version: 'example', model: 'example' }));
  const { data } = await sb.from('assets').insert(rows).select('id');
  for (const a of data ?? []) await enqueue(sb, wsId, 'asset.intake', { asset_id: a.id }, `intake:${a.id}`);
  revalidatePath(`/app/${wsId}`, 'layout');
}

// ---------------------------------------------------------------- brand brain
const lines = (v: FormDataEntryValue | null, maxItems = 15) =>
  str(v, 4000).split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).slice(0, maxItems);

/** No site (or the crawl failed): build from the founder's own description. */
export async function buildFromDescription(_: unknown, form: FormData): Promise<{ error?: string }> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const description = str(form.get('description'), 3000);
  if (description.length < 30) return { error: 'Tell us a bit more: what it does and who it’s for (a few sentences).' };
  await sb.from('brand_brains').update({ description, status: 'building', error: null }).eq('workspace_id', wsId);
  await enqueue(sb, wsId, 'brand.build', {}, `brand:${wsId}:${Date.now()}`);
  revalidatePath(`/app/setup/${wsId}`);
  return {};
}

export async function rebuildBrand(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await sb.from('brand_brains').update({ status: 'building', error: null }).eq('workspace_id', wsId);
  await enqueue(sb, wsId, 'brand.build', {}, `brand:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}`, 'layout');
}

export async function saveBrand(_: unknown, form: FormData): Promise<{ ok?: boolean; error?: string }> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const confirm = form.get('confirm') === '1';
  const now = new Date().toISOString();
  const one_liner = str(form.get('one_liner'), 160);
  if (!one_liner) return { error: 'Add a one-line description.' };
  const { error } = await sb.from('brand_brains').update({
    one_liner,
    target_customer: str(form.get('target_customer'), 600),
    pain_points: lines(form.get('pain_points')),
    keywords: lines(form.get('keywords'), 25),
    competitors: lines(form.get('competitors')),
    content_pillars: lines(form.get('content_pillars'), 6),
    updated_at: now,
    ...(confirm ? { confirmed_at: now } : {}),
  }).eq('workspace_id', wsId);
  await sb.from('voice_profiles').update({ tone: str(form.get('tone'), 120), updated_at: now }).eq('workspace_id', wsId);
  if (error) return { error: 'Couldn’t save. Try again.' };
  revalidatePath(`/app/${wsId}`, 'layout');
  if (confirm) redirect(`/app/${wsId}/inbox`);
  return { ok: true };
}
