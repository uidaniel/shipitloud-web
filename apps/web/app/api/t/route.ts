import { NextResponse, type NextRequest } from 'next/server';
import { rateLimited } from '@/lib/waitlist/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { recordTrack } from '@shipitloud/engine';

// Events from the tracking snippet on founders' sites. Any origin may send; the key decides the workspace.
// Nothing personal is stored: a random visitor id from the visitor's own browser, the page path and the channel.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const ok = () => new NextResponse(null, { status: 204, headers: CORS });

const keys = new Map<string, { ws: string | null; at: number }>();
async function workspaceFor(key: string) {
  const hit = keys.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ws;
  const { data } = await supabaseAdmin().from('workspaces').select('id').eq('tracking_key', key).maybeSingle();
  keys.set(key, { ws: data?.id ?? null, at: Date.now() });
  return data?.id ?? null;
}

const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 4000) return ok();
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw); } catch { return ok(); }
  const key = clip(b.key, 64);
  const type = b.type === 'signup' || b.type === 'custom' ? b.type : b.type === 'pageview' ? 'pageview' : null;
  if (!key || !/^[a-f0-9]{16,64}$/i.test(key) || !type) return ok();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(`t:${key}:${ip}`, 120, 60_000)) return ok();
  const ws = await workspaceFor(key);
  if (!ws) return ok();
  const db = supabaseAdmin();
  const visitor = clip(b.visitor, 40);
  let source = clip(b.source, 60)?.toLowerCase() ?? null;
  let medium = clip(b.medium, 40);
  let campaign = clip(b.campaign, 80);
  const ref = clip(b.ref, 12);
  // Our own short link is the most reliable signal: use its channel.
  if (ref && /^[A-Za-z0-9]{5,12}$/.test(ref)) {
    const { data: l } = await db.from('short_links').select('source, medium, campaign').eq('code', ref).eq('workspace_id', ws).maybeSingle();
    if (l) { source = l.source; medium = l.medium; campaign = l.campaign ?? campaign; }
  }
  // One signup per visitor per day, so a double-submitted form isn't two people.
  if (type === 'signup' && visitor) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await db.from('track_events').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('type', 'signup').eq('visitor', visitor).gte('created_at', since);
    if (count) return ok();
  }
  // A signed-in user on the founder's app (shipitloud('identify', id)): an opaque id only, never an email. Lets us
  // spot users who signed up but didn't activate. Visits count at most once an hour; email, plan and paid status
  // only come from the founder's server.
  const user = clip(b.user, 120);
  if (user && !user.includes('@')) {
    const name = type === 'custom' ? clip(b.name, 40) : null;
    const event = name === 'identify' ? null : name ?? (type === 'signup' ? 'signup' : null);
    try {
      if (event || type === 'signup' || name === 'identify') await recordTrack(db, ws, { user: { id: user }, event, at: null }, { browser: true });
      else {
        const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
        const { data: seen } = await db.from('end_users').update({ last_seen_at: new Date().toISOString() }).eq('workspace_id', ws).eq('external_id', user).or(`last_seen_at.is.null,last_seen_at.lt.${hourAgo}`).select('id');
        if (seen?.[0]) await db.from('user_events').insert({ workspace_id: ws, end_user_id: seen[0].id, event: 'visit' });
      }
    } catch { /* tracking must never break the founder's site */ }
    if (name === 'identify') return ok();
  }
  // Meta Conversions API: a consented signup from someone who clicked a Meta ad (fbclid) is sent server-side.
  const fbc = clip(b.fbc, 200);
  if (type === 'signup' && b.consent === 'granted' && fbc && /^fb\.1\.\d+\.[\w-]+$/.test(fbc)) {
    const { count: running } = await db.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('platform', 'meta').in('status', ['active', 'paused', 'capped']);
    if (running) await db.rpc('enqueue_job', { p_workspace: ws, p_type: 'ads.capi', p_payload: { event_id: `${visitor ?? 'v'}:${new Date().toISOString().slice(0, 10)}`, fbc, consent: 'granted', url: clip(b.path, 300) }, p_run_at: new Date().toISOString(), p_key: `capi:${ws}:${visitor}:${new Date().toISOString().slice(0, 10)}` });
  }
  await db.from('track_events').insert({
    workspace_id: ws, type, name: type === 'custom' ? clip(b.name, 40) : null, visitor, source, medium, campaign, ref_code: ref,
    path: clip(b.path, 300), referrer_host: clip(b.referrer, 120),
  });
  return ok();
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });
