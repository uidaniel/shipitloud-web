'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser, requireWorkspace, supabaseAdmin } from '@/lib/supabase/server';

export type FormState = { ok?: boolean; error?: string; values?: Record<string, string | string[]> };

/** A failed save echoes back what was submitted (never passwords), so the form keeps it: React resets forms after a submit. */
function fail(form: FormData, error: string): FormState {
  const values: Record<string, string | string[]> = {};
  for (const k of new Set(form.keys())) {
    if (k.startsWith('$ACTION') || ['password', 'current', 'confirm'].includes(k)) continue;
    const all = form.getAll(k).filter((v): v is string => typeof v === 'string');
    values[k] = all.length > 1 ? all : all[0] ?? '';
  }
  return { error, values };
}

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
export async function createWorkspace(_: unknown, form: FormData): Promise<FormState> {
  const { sb, user } = await requireUser();
  const name = str(form.get('product_name'), 80);
  const rawUrl = str(form.get('url'), 300);
  const url = normalizeUrl(rawUrl);
  if (!name) return fail(form, 'Give your product a name.');
  if (rawUrl && !url) return fail(form, 'That link doesn’t look right. Try something like yourproduct.com');
  const { data, error } = await sb.from('workspaces').insert({ owner_id: user.id, product_name: name, url }).select('id').single();
  if (error || !data) return fail(form, 'Couldn’t create your workspace. Try again.');
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
    // An edited thread is re-split on blank lines, so the posted parts match what the founder approved.
    const prev = asset.content as { thread?: string[] };
    const content = edited ? { ...prev, text: edited, ...(prev.thread ? { thread: edited.split(/\n\s*\n/).map((t) => t.trim()).filter((t) => t && !/^[—–\-\s]+$/.test(t)) } : {}) } : asset.content;
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
  const { data } = await sb.from('assets').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', assetId).eq('workspace_id', wsId).eq('status', 'scheduled').select('content').maybeSingle();
  // A posted reply closes its conversation in Listening.
  const mentionId = (data?.content as { mention_id?: string } | undefined)?.mention_id;
  if (mentionId) await sb.from('mentions').update({ status: 'replied' }).eq('id', mentionId).eq('workspace_id', wsId);
  revalidatePath(`/app/${wsId}`, 'layout');
}

// ---------------------------------------------------------------- settings
export async function saveAutomation(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb, ws } = await requireWorkspace(wsId);
  const mode = str(form.get('trust_mode'));
  if (!['manual', 'trust', 'full'].includes(mode)) return fail(form, 'Pick a mode.');
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

export async function saveProduct(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const name = str(form.get('product_name'), 80);
  const rawUrl = str(form.get('url'));
  const url = normalizeUrl(rawUrl);
  const launch = str(form.get('launch_date'), 10);
  if (!name) return fail(form, 'Your product needs a name.');
  if (rawUrl && !url) return fail(form, 'That link doesn’t look right.');
  const { error } = await sb.from('workspaces').update({ product_name: name, url, launch_date: launch || null }).eq('id', wsId);
  revalidatePath(`/app/${wsId}`, 'layout');
  return error ? { error: 'Couldn’t save. Try again.' } : { ok: true };
}

export async function saveNotifications(_: unknown, form: FormData): Promise<FormState> {
  const { sb, user } = await requireUser();
  const hook = str(form.get('slack_webhook'), 500);
  if (hook && !/^https:\/\/hooks\.slack\.com\//.test(hook)) return fail(form, 'Slack webhooks start with https://hooks.slack.com/');
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

/** Ends every session on every device, including this one. */
export async function signOutEverywhere() {
  const { sb } = await requireUser();
  await sb.auth.signOut({ scope: 'global' });
  redirect('/login');
}

/** Change (or, for magic-link accounts, set) the password. The current one is checked first when there is one. */
export async function changePassword(_: unknown, form: FormData): Promise<FormState> {
  const { sb, user } = await requireUser();
  const current = typeof form.get('current') === 'string' ? String(form.get('current')) : '';
  const next = typeof form.get('password') === 'string' ? String(form.get('password')) : '';
  const confirm = typeof form.get('confirm') === 'string' ? String(form.get('confirm')) : '';
  if (next.length < 8) return fail(form, 'Use at least 8 characters.');
  if (next !== confirm) return fail(form, 'The two new passwords don’t match.');
  if (user.user_metadata?.has_password) {
    if (!current) return fail(form, 'Enter your current password.');
    // Check it on a throwaway client so this session isn't touched.
    const { createClient } = await import('@supabase/supabase-js');
    const probe = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await probe.auth.signInWithPassword({ email: user.email!, password: current });
    if (error) return fail(form, 'Your current password isn’t right.');
    await probe.auth.signOut({ scope: 'local' });
  }
  const { error } = await sb.auth.updateUser({ password: next, data: { has_password: true } });
  if (error) {
    const m = error.message.toLowerCase();
    return fail(form, m.includes('same') ? 'That’s your current password. Pick a new one.' : m.includes('pwned') || m.includes('weak') ? 'That password has shown up in a data breach. Pick another one.' : 'Couldn’t change it. Try again.');
  }
  return { ok: true };
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
export async function buildFromDescription(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const description = str(form.get('description'), 3000);
  if (description.length < 30) return fail(form, 'Tell us a bit more: what it does and who it’s for (a few sentences).');
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

export async function saveBrand(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const confirm = form.get('confirm') === '1';
  const now = new Date().toISOString();
  const one_liner = str(form.get('one_liner'), 160);
  if (!one_liner) return fail(form, 'Add a one-line description.');
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
  if (error) return fail(form, 'Couldn’t save. Try again.');
  revalidatePath(`/app/${wsId}`, 'layout');
  if (confirm) redirect(`/app/${wsId}/inbox`);
  return { ok: true };
}

// ---------------------------------------------------------------- launch kit
export async function makePosters(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'kit.posters', {}, `posters:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/kit`);
}

export async function makeLaunchKit(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'kit.launch', {}, `launch:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}`, 'layout');
}

export async function makeDemoVideo(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'kit.video', {}, `video:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/kit`);
}

const SHOT_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Founder screenshots for the demo video. Up to 5, 5MB each. Phone-shaped images are tagged so portrait cuts use a phone frame. */
export async function uploadShots(form: FormData) {
  const wsId = str(form.get('ws'));
  await requireWorkspace(wsId);
  const admin = supabaseAdmin();
  const { data: existing } = await admin.storage.from('assets').list(`${wsId}/shots`);
  let room = 5 - (existing?.length ?? 0);
  for (const f of form.getAll('shots')) {
    if (room <= 0) break;
    if (!(f instanceof File) || !SHOT_TYPES[f.type] || f.size > 5_000_000 || f.size === 0) continue;
    const phone = str(form.get(`shape:${f.name}`)) === 'tall';
    const path = `${wsId}/shots/${Date.now()}-${crypto.randomUUID().slice(0, 6)}${phone ? '-mobile' : ''}.${SHOT_TYPES[f.type]}`;
    const { error } = await admin.storage.from('assets').upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type });
    if (!error) room--;
  }
  revalidatePath(`/app/${wsId}/kit`);
}

export async function removeShot(form: FormData) {
  const wsId = str(form.get('ws'));
  await requireWorkspace(wsId);
  const name = str(form.get('name'), 120);
  if (!/^[\w.-]+$/.test(name)) return;
  await supabaseAdmin().storage.from('assets').remove([`${wsId}/shots/${name}`]);
  revalidatePath(`/app/${wsId}/kit`);
}

export async function runReadinessCheck(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'kit.readiness', {}, `readiness:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/kit`);
}

export async function toggleTask(form: FormData) {
  const wsId = str(form.get('ws'));
  const id = str(form.get('task'));
  const { sb } = await requireWorkspace(wsId);
  const { data } = await sb.from('launch_plans').select('tasks').eq('workspace_id', wsId).maybeSingle();
  if (!data) return;
  const tasks = (data.tasks as { id: string; done: boolean }[]).map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  await sb.from('launch_plans').update({ tasks, updated_at: new Date().toISOString() }).eq('workspace_id', wsId);
  revalidatePath(`/app/${wsId}/plan`);
}

export async function setDirectory(form: FormData) {
  const wsId = str(form.get('ws'));
  const dir = str(form.get('dir'));
  const status = str(form.get('status'));
  if (!['todo', 'drafted', 'submitted', 'live', 'rejected'].includes(status)) return;
  const { sb } = await requireWorkspace(wsId);
  await sb.from('directory_submissions').upsert({
    workspace_id: wsId, directory_id: dir, status, updated_at: new Date().toISOString(),
    ...(status === 'submitted' ? { submitted_at: new Date().toISOString() } : {}),
  });
  revalidatePath(`/app/${wsId}/kit`);
}

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export async function savePage(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb, ws } = await requireWorkspace(wsId);
  const slug = slugify(str(form.get('slug'), 60) || ws.product_name);
  if (slug.length < 3) return fail(form, 'The page address needs at least 3 letters or numbers.');
  if (slug === 'shipitloud') return fail(form, 'That address is taken.');
  const publish = form.get('publish') === 'on';
  const row = {
    workspace_id: wsId, slug,
    headline: str(form.get('headline'), 90) || null,
    subhead: str(form.get('subhead'), 240) || null,
    cta: str(form.get('cta'), 30) || 'Join the waitlist',
    show_badge: ws.plan === 'free' ? true : form.get('show_badge') === 'on',
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await sb.from('waitlist_pages').select('id, published_at').eq('workspace_id', wsId).maybeSingle();
  const published_at = publish ? existing?.published_at ?? new Date().toISOString() : null;
  const res = existing
    ? await sb.from('waitlist_pages').update({ ...row, published_at }).eq('id', existing.id)
    : await sb.from('waitlist_pages').insert({ ...row, published_at });
  if (res.error) return fail(form, res.error.code === '23505' ? 'That address is taken. Try another.' : 'Couldn’t save. Try again.');
  revalidatePath(`/app/${wsId}/waitlist`);
  return { ok: true };
}

// ---------------------------------------------------------------- listening
const LISTEN_SOURCES = ['hn', 'bluesky', 'github', 'rss', 'producthunt', 'x'] as const;

/** Save what to listen for. The first start also looks back 30 days for warm leads. */
export async function saveListening(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const keywords = lines(form.get('keywords'), 10).map((k) => k.slice(0, 60));
  const competitors = lines(form.get('competitors'), 5).map((k) => k.slice(0, 40));
  const exclude = lines(form.get('exclude'), 20).map((k) => k.slice(0, 40));
  const feeds = lines(form.get('rss_feeds'), 5);
  const rss_feeds = feeds.map((f) => normalizeUrl(f)).filter((f): f is string => !!f);
  const sources = form.getAll('sources').map(String).filter((s): s is (typeof LISTEN_SOURCES)[number] => (LISTEN_SOURCES as readonly string[]).includes(s));
  const threshold = Math.max(30, Math.min(95, Number(form.get('threshold')) || 60));
  if (!keywords.length && !competitors.length) return fail(form, 'Add at least one phrase to listen for.');
  if (!sources.length) return fail(form, 'Pick at least one place to listen.');
  if (feeds.length !== rss_feeds.length) return fail(form, 'One of the feed links doesn’t look right.');
  if (sources.includes('rss') && !rss_feeds.length) return fail(form, 'Add a feed link, or untick RSS.');

  const { data: before } = await sb.from('listen_configs').select('backfilled_at').eq('workspace_id', wsId).maybeSingle();
  const start = form.get('start') === '1';
  const row = { workspace_id: wsId, keywords, competitors, exclude, rss_feeds, sources, threshold, updated_at: new Date().toISOString(), ...(start ? { active: true } : {}) };
  const { error } = await sb.from('listen_configs').upsert(row, { onConflict: 'workspace_id' });
  if (error) return fail(form, 'Couldn’t save. Try again.');
  if (start && !before?.backfilled_at) await enqueue(sb, wsId, 'listen.poll', { backfill: true }, `backfill:${wsId}`);
  revalidatePath(`/app/${wsId}/listening`);
  return { ok: true };
}

export async function setListening(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await sb.from('listen_configs').update({ active: form.get('on') === 'true' }).eq('workspace_id', wsId);
  revalidatePath(`/app/${wsId}/listening`);
}

export async function listenNow(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'listen.poll', {}, `poll:${wsId}:now:${Math.floor(Date.now() / 60_000)}`);
  revalidatePath(`/app/${wsId}/listening`);
}

export async function draftMention(form: FormData) {
  const wsId = str(form.get('ws'));
  const id = str(form.get('mention'));
  const { sb } = await requireWorkspace(wsId);
  const { data } = await sb.from('mentions').select('id').eq('id', id).eq('workspace_id', wsId).maybeSingle();
  if (!data) return;
  await enqueue(sb, wsId, 'listen.draft', { mention_id: id }, `draft:${id}`);
  revalidatePath(`/app/${wsId}/listening`);
}

export async function setMentionStatus(form: FormData) {
  const wsId = str(form.get('ws'));
  const status = str(form.get('status'));
  const { sb } = await requireWorkspace(wsId);
  if (!['new', 'dismissed', 'replied'].includes(status)) return;
  await sb.from('mentions').update({ status }).eq('id', str(form.get('mention'))).eq('workspace_id', wsId);
  revalidatePath(`/app/${wsId}/listening`);
}

// ---------------------------------------------------------------- Chrome extension
/** A new connection token for the extension. Shown once; only its hash is stored. */
export async function createExtensionToken(_: unknown, form: FormData): Promise<{ token?: string; error?: string }> {
  const wsId = str(form.get('ws'));
  const { user } = await requireWorkspace(wsId);
  const { hashToken, newToken } = await import('@/lib/ext');
  const token = newToken();
  const admin = supabaseAdmin();
  const { count } = await admin.from('extension_tokens').select('id', { count: 'exact', head: true }).eq('workspace_id', wsId).is('revoked_at', null);
  if ((count ?? 0) >= 5) return fail(form, 'You have 5 connections already. Remove one first.');
  const { error } = await admin.from('extension_tokens').insert({ workspace_id: wsId, user_id: user.id, token_hash: hashToken(token), label: str(form.get('label'), 40) || 'Chrome' });
  if (error) return fail(form, 'Couldn’t create a connection. Try again.');
  revalidatePath(`/app/${wsId}/settings`);
  return { token };
}

export async function revokeExtensionToken(form: FormData) {
  const wsId = str(form.get('ws'));
  await requireWorkspace(wsId);
  await supabaseAdmin().from('extension_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', str(form.get('id'))).eq('workspace_id', wsId);
  revalidatePath(`/app/${wsId}/settings`);
}

// ---------------------------------------------------------------- content engine
export async function planWeek(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'content.week', {}, `week:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/content`);
}

export async function writeFromFormat(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const slug = str(form.get('slug'), 60);
  const platform = str(form.get('platform')) === 'linkedin' ? 'linkedin' : 'x';
  await enqueue(sb, wsId, 'content.from_format', { slug, platform, topic: str(form.get('topic'), 500) }, `fmt:${wsId}:${slug}:${platform}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/content`);
}

export async function repurposePost(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const id = str(form.get('asset'));
  const { data } = await sb.from('assets').select('id').eq('id', id).eq('workspace_id', wsId).maybeSingle();
  if (!data) return;
  await enqueue(sb, wsId, 'content.repurpose', { asset_id: id }, `repurpose:${id}`);
  revalidatePath(`/app/${wsId}/content`);
}

export async function saveContentSources(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const rawFeed = str(form.get('changelog_url'), 300);
  const feed = rawFeed ? normalizeUrl(rawFeed) : null;
  if (rawFeed && !feed) return fail(form, 'That feed link doesn’t look right.');
  const repo = str(form.get('github_repo'), 120).replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$|\/$/g, '');
  if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail(form, 'Use the owner/name form, like vercel/next.js.');
  const { error } = await sb.from('content_sources').upsert({ workspace_id: wsId, changelog_url: feed, github_repo: repo || null, weekly_plan: form.get('weekly_plan') === 'on', updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
  if (error) return fail(form, 'Couldn’t save. Try again.');
  if (feed || repo) await enqueue(sb, wsId, 'content.check_updates', {}, `updates:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/content`);
  return { ok: true };
}

export async function setWeeklyPlan(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await sb.from('content_sources').upsert({ workspace_id: wsId, weekly_plan: form.get('on') === 'true', updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
  revalidatePath(`/app/${wsId}/content`);
}

/** A fresh webhook secret, shown once. GitHub signs every delivery with it. */
export async function createWebhookSecret(_: unknown, form: FormData): Promise<{ secret?: string; error?: string }> {
  const wsId = str(form.get('ws'));
  await requireWorkspace(wsId);
  const { randomBytes } = await import('node:crypto');
  const secret = randomBytes(24).toString('hex');
  const { error } = await supabaseAdmin().from('content_sources').upsert({ workspace_id: wsId, webhook_secret: secret, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
  if (error) return fail(form, 'Couldn’t create it. Try again.');
  return { secret };
}

export async function addManualUpdate(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const title = str(form.get('title'), 200);
  if (title.length < 4) return fail(form, 'Say what you shipped in a few words.');
  const { data, error } = await sb.from('product_updates').insert({ workspace_id: wsId, source: 'manual', external_id: `manual:${Date.now()}`, title, body: str(form.get('body'), 2000) || null, published_at: new Date().toISOString() }).select('id').single();
  if (error || !data) return fail(form, 'Couldn’t save. Try again.');
  await enqueue(sb, wsId, 'content.update_posts', { update_id: data.id }, `update:${data.id}`);
  revalidatePath(`/app/${wsId}/content`);
  return { ok: true };
}

/** Save the founder's own posts (separated by a line with ---) and learn the voice from them. */
export async function saveVoiceSamples(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const samples = str(form.get('samples'), 20_000).split(/\n\s*-{3,}\s*\n/).map((s) => s.trim()).filter((s) => s.length >= 20).slice(0, 12);
  if (samples.length < 2) return fail(form, 'Paste at least two of your posts, with a line of --- between them.');
  const { error } = await sb.from('voice_profiles').update({ sample_posts: samples, updated_at: new Date().toISOString() }).eq('workspace_id', wsId);
  if (error) return fail(form, 'Couldn’t save. Try again.');
  await enqueue(sb, wsId, 'content.voice', {}, `voice:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/content`);
  return { ok: true };
}

// ---------------------------------------------------------------- SEO blog
const BLOG_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export async function saveBlog(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const slug = str(form.get('slug'), 40).toLowerCase();
  const title = str(form.get('title'), 80);
  if (!BLOG_SLUG.test(slug)) return fail(form, 'Use 3 to 40 lowercase letters, numbers or dashes.');
  if (!title) return fail(form, 'Give the blog a title.');
  const { data: taken } = await supabaseAdmin().from('blogs').select('workspace_id').eq('slug', slug).maybeSingle();
  if (taken && taken.workspace_id !== wsId) return fail(form, 'That address is taken. Try another.');
  const { error } = await sb.from('blogs').upsert({ workspace_id: wsId, slug, title, description: str(form.get('description'), 200) || null, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
  if (error) return fail(form, 'Couldn’t save. Try again.');
  revalidatePath(`/app/${wsId}/blog`);
  return { ok: true };
}

export async function findKeywordIdeas(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'blog.keywords', {}, `kw:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/blog`);
}

export async function addKeyword(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const keyword = str(form.get('keyword'), 120).toLowerCase().replace(/\s+/g, ' ');
  if (keyword.split(' ').length < 2) return fail(form, 'Use the words people would type into Google, like "invoice app for freelancers".');
  const kind = /^best\b/.test(keyword) ? 'best' : /\balternatives?\b/.test(keyword) ? 'alternative' : /\bvs\.?\b|\bversus\b/.test(keyword) ? 'versus' : /^how\b/.test(keyword) ? 'howto' : /\?$|^(what|why|when|which|can|is|does)\b/.test(keyword) ? 'question' : 'usecase';
  const { error } = await sb.from('seo_keywords').insert({ workspace_id: wsId, keyword, kind, source: 'manual', priority: 70 });
  if (error) return fail(form, error.code === '23505' ? 'You already have that one.' : 'Couldn’t save. Try again.');
  revalidatePath(`/app/${wsId}/blog`);
  return { ok: true };
}

export async function writeArticleFor(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const id = str(form.get('keyword'));
  const { data } = await sb.from('seo_keywords').select('id, status').eq('id', id).eq('workspace_id', wsId).maybeSingle();
  if (!data || data.status === 'written') return;
  await sb.from('seo_keywords').update({ status: 'writing' }).eq('id', id);
  await enqueue(sb, wsId, 'blog.write', { keyword_id: id }, `write:${id}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/blog`);
}

export async function skipKeyword(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await sb.from('seo_keywords').update({ status: str(form.get('undo')) ? 'idea' : 'skipped' }).eq('id', str(form.get('keyword'))).eq('workspace_id', wsId);
  revalidatePath(`/app/${wsId}/blog`);
}

/** Edit an article. The SEO score is recomputed and the inbox summary kept in sync. */
export async function saveArticle(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const id = str(form.get('post'));
  const { data: post } = await sb.from('blog_posts').select('id, keyword, slug, faq, asset_id, excerpt').eq('id', id).eq('workspace_id', wsId).maybeSingle();
  if (!post) return fail(form, 'Article not found.');
  const title = str(form.get('title'), 140);
  const body = typeof form.get('body') === 'string' ? String(form.get('body')).slice(0, 60_000) : '';
  const meta = { title: str(form.get('meta_title'), 90), description: str(form.get('meta_description'), 200) };
  if (!title || body.trim().length < 200) return fail(form, 'The article needs a title and some content.');
  const { seoScore } = await import('@shipitloud/engine');
  const { data: brain } = await sb.from('brand_brains').select('competitors').eq('workspace_id', wsId).maybeSingle();
  const seo = seoScore({ keyword: post.keyword, title, slug: post.slug, metaTitle: meta.title, metaDescription: meta.description, body, faq: post.faq as { q: string; a: string }[], competitors: brain?.competitors ?? [] });
  const { error } = await sb.from('blog_posts').update({ title, body, meta, seo_score: seo.score, seo_tips: seo.tips, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return fail(form, 'Couldn’t save. Try again.');
  if (post.asset_id) {
    const { data: a } = await sb.from('assets').select('content, flags').eq('id', post.asset_id).maybeSingle();
    // Facts to check are cleared once the founder has removed every [verify] mark.
    // Checks clear as the founder resolves them: [verify] marks removed, competitor statements reviewed or reworded.
    const flags = ((a?.flags ?? []) as string[])
      .filter((f) => (!/fact.* to check/.test(f) || seo.verify.length > 0) && (!/about other products/.test(f) || seo.claims.length > 0));
    await sb.from('assets').update({
      title: `Article: ${title}`.slice(0, 140), flags, publish_score: seo.score, qa_score: seo.score,
      content: { ...(a?.content as object), text: `${post.excerpt ?? ''}\n\n${seo.words.toLocaleString('en-US')} words · SEO score ${seo.score}${seo.tips[0] ? ` · ${seo.tips[0]}` : ''}` },
    }).eq('id', post.asset_id);
  }
  revalidatePath(`/app/${wsId}/blog`);
  revalidatePath(`/app/${wsId}/blog/${id}`);
  return { ok: true };
}

/** Take a published article down, or put it back up (it was approved before). */
export async function setArticleLive(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb, ws } = await requireWorkspace(wsId);
  const live = form.get('live') === 'true';
  if (live && ws.kill_switch) return; // the kill switch stops publishing too
  const { data: post } = await sb.from('blog_posts').select('id, published_at, status').eq('id', str(form.get('post'))).eq('workspace_id', wsId).maybeSingle();
  if (!post || (live && !post.published_at)) return; // never-approved drafts go through the inbox
  await sb.from('blog_posts').update({ status: live ? 'published' : 'unpublished', updated_at: new Date().toISOString() }).eq('id', post.id);
  revalidatePath(`/app/${wsId}/blog`);
  revalidatePath(`/app/${wsId}/blog/${post.id}`);
}

// ---------------------------------------------------------------- UGC (short video + carousels)
export async function findNicheFormats(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'ugc.formats', {}, `ugcfmt:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/content`);
}

export async function makeUgc(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const formatId = str(form.get('format'));
  const { data: f } = await sb.from('viral_formats').select('id, kind').eq('id', formatId).maybeSingle();
  if (!f || (f.kind !== 'video' && f.kind !== 'carousel')) return;
  await enqueue(sb, wsId, f.kind === 'video' ? 'ugc.video' : 'ugc.carousel', { format_id: f.id, topic: str(form.get('topic'), 300) }, `ugc:${f.id}:${Date.now()}`);
  redirect(`/app/${wsId}/content?tab=videos`);
}

// ---------------------------------------------------------------- tracking
/** A tracked short link for anywhere the founder shares their product (bio, newsletter, a talk). */
export async function makeShortLink(_: unknown, form: FormData): Promise<FormState & { link?: string }> {
  const wsId = str(form.get('ws'));
  const { sb, ws } = await requireWorkspace(wsId);
  const target = normalizeUrl(str(form.get('target'), 500) || ws.url || '');
  if (!target) return fail(form, 'Add the page the link should open.');
  const source = str(form.get('source'), 40).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'other';
  const campaign = str(form.get('campaign'), 60).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || null;
  const { createShortLink } = await import('@shipitloud/engine');
  try {
    const code = await createShortLink(sb, wsId, { target, source, medium: str(form.get('medium'), 20) || 'social', campaign });
    revalidatePath(`/app/${wsId}/analytics`);
    const { site } = await import('@/lib/site');
    return { link: `${site.url}/l/${code}` };
  } catch {
    return fail(form, 'Couldn’t create the link. Try again.');
  }
}

export async function deleteShortLink(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await sb.from('short_links').delete().eq('id', str(form.get('id'))).eq('workspace_id', wsId);
  revalidatePath(`/app/${wsId}/analytics`);
}

// ---------------------------------------------------------------- waitlist emails
export async function saveEmailSettings(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const replyTo = str(form.get('reply_to'), 120);
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) return fail(form, 'The reply-to address doesn’t look right.');
  const address = str(form.get('business_address'), 300);
  const on = form.get('sequence_on') === 'on';
  if (on && address.length < 10) return fail(form, 'Add your business address first. The law requires it in marketing emails (it can be a PO box or registered agent).');
  const { error } = await sb.from('email_settings').upsert({ workspace_id: wsId, from_name: str(form.get('from_name'), 60) || null, reply_to: replyTo || null, business_address: address || null, sequence_on: on, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
  if (error) return fail(form, 'Couldn’t save. Try again.');
  revalidatePath(`/app/${wsId}/waitlist`);
  return { ok: true };
}

export async function draftSequence(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'email.draft_sequence', {}, `seqdraft:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/waitlist`);
}

export async function draftBroadcastEmail(_: unknown, form: FormData): Promise<FormState> {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  const topic = str(form.get('topic'), 300);
  if (topic.length < 8) return fail(form, 'Say in a line what the email is about.');
  await enqueue(sb, wsId, 'email.draft_broadcast', { topic }, `bcast:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/waitlist`);
  return { ok: true };
}

// ---------------------------------------------------------------- digest
/** Write this week's digest now (shown on Momentum, not sent). At most once every few minutes. */
export async function makeDigestNow(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'digest.build', { kind: 'weekly' }, `digestnow:${wsId}:${Math.floor(Date.now() / 300_000)}`);
  revalidatePath(`/app/${wsId}/analytics`);
}

// ---------------------------------------------------------------- conversion: landing page audit, network launch
export async function runPageAudit(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'kit.audit', {}, `audit:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/kit`);
}

export async function draftNetworkMessages(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'kit.network', {}, `network:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/kit`);
}

/** Count one more (or one fewer) person the founder sent a message to. */
export async function countNetworkSend(ws: string, kind: string, delta: 1 | -1) {
  const { sb } = await requireWorkspace(ws);
  const { data, error } = await sb.rpc('network_sent', { p_ws: ws, p_kind: kind, p_delta: delta });
  if (error) return null;
  return data as number;
}

export async function draftLaunchEmail(form: FormData) {
  const wsId = str(form.get('ws'));
  const { sb } = await requireWorkspace(wsId);
  await enqueue(sb, wsId, 'email.draft_broadcast', { topic: 'We just launched: it is live today, and here is how to start' }, `launchmail:${wsId}:${Date.now()}`);
  revalidatePath(`/app/${wsId}/kit`);
}
