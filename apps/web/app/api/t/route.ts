import { NextResponse, type NextRequest } from 'next/server';
import { rateLimited } from '@/lib/waitlist/guard';
import { supabaseAdmin } from '@/lib/supabase/server';

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
  await db.from('track_events').insert({
    workspace_id: ws, type, name: type === 'custom' ? clip(b.name, 40) : null, visitor, source, medium, campaign, ref_code: ref,
    path: clip(b.path, 300), referrer_host: clip(b.referrer, 120),
  });
  return ok();
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });
