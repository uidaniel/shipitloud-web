import { NextResponse, type NextRequest } from 'next/server';
import { hashKey, parseTrack, recordTrack } from '@shipitloud/engine';
import { rateLimited } from '@/lib/waitlist/guard';
import { supabaseAdmin } from '@/lib/supabase/server';

// Server API for the founder's own backend: tell us about a user (email, plan, trial, paid) and what they did.
//   POST /api/v1/track   Authorization: Bearer sil_sk_...
//   { "user": { "id": "u_123", "email": "ada@example.com", "status": "trial", "trial_ends_at": "2026-10-20" }, "event": "activated" }
// Secret keys must never be put in a web page; the browser snippet has its own, limited, way in.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

const keys = new Map<string, { ws: string | null; id: string | null; at: number }>();
async function workspaceFor(key: string) {
  const hit = keys.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const { data } = await supabaseAdmin().from('api_keys').select('id, workspace_id').eq('hash', hashKey(key)).is('revoked_at', null).maybeSingle();
  const v = { ws: data?.workspace_id ?? null, id: data?.id ?? null, at: Date.now() };
  keys.set(key, v);
  return v;
}

export async function POST(req: NextRequest) {
  const key = req.headers.get('authorization')?.match(/^Bearer\s+(sil_sk_[\w-]{20,64})$/)?.[1];
  if (!key) return json({ error: 'Send your secret key as "Authorization: Bearer sil_sk_..."' }, 401);
  if (rateLimited(`v1:${key.slice(0, 16)}`, 600, 60_000)) return json({ error: 'Too many requests: up to 600 a minute.' }, 429);
  const k = await workspaceFor(key);
  if (!k.ws) return json({ error: 'This key is not valid, or it was revoked.' }, 401);
  const raw = await req.text();
  if (raw.length > 8000) return json({ error: 'Request too large.' }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Send JSON.' }, 400); }
  const t = parseTrack(body);
  if ('error' in t) return json({ error: t.error }, 400);
  const db = supabaseAdmin();
  try {
    const user = await recordTrack(db, k.ws, t);
    if (k.id && Math.random() < 0.2) await db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', k.id);
    return json({ ok: true, user });
  } catch {
    return json({ error: 'Could not save that. Try again.' }, 500);
  }
}
