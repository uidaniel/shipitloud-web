import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rateLimited } from '@/lib/waitlist/guard';
import { supabaseAdmin } from '@/lib/supabase/server';

// The Chrome extension authenticates with a per-workspace token (shown once, stored as a SHA-256 hash).

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => `sil_${randomBytes(24).toString('base64url')}`;

export interface ExtCtx { db: SupabaseClient; workspaceId: string; userId: string; plan: string; name: string; url: string | null }

function cors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get('origin') ?? '';
  if (origin.startsWith('chrome-extension://')) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Headers', 'authorization, content-type');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.headers.set('Vary', 'Origin');
  }
  return res;
}

export const json = (req: NextRequest, body: unknown, status = 200) => cors(req, NextResponse.json(body, { status }));
export const preflightResponse = (req: NextRequest) => cors(req, new NextResponse(null, { status: 204 }));

/** Resolves the token to its workspace, or returns the error response to send. */
export async function extAuth(req: NextRequest): Promise<ExtCtx | NextResponse> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  if (!/^sil_[\w-]{20,}$/.test(token)) return json(req, { error: 'Connect the extension from Settings in ShipItLoud.' }, 401);
  if (rateLimited(`ext:${token.slice(-12)}`, 120, 60_000)) return json(req, { error: 'Slow down a little.' }, 429);
  const db = supabaseAdmin();
  const { data: t } = await db.from('extension_tokens').select('id, workspace_id, user_id, revoked_at, last_used_at').eq('token_hash', hashToken(token)).maybeSingle();
  if (!t || t.revoked_at) return json(req, { error: 'This connection was removed. Connect again from Settings.' }, 401);
  const { data: ws } = await db.from('workspaces').select('plan, product_name, url').eq('id', t.workspace_id).single();
  if (!ws) return json(req, { error: 'Workspace not found.' }, 404);
  if (!t.last_used_at || Date.now() - Date.parse(t.last_used_at) > 5 * 60_000) await db.from('extension_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', t.id);
  return { db, workspaceId: t.workspace_id, userId: t.user_id, plan: ws.plan, name: ws.product_name, url: ws.url };
}

/** What to listen for: the saved Listening settings, or sensible defaults from the brand brain. */
export async function listenTerms(db: SupabaseClient, workspaceId: string) {
  const [{ data: cfg }, { data: brain }] = await Promise.all([
    db.from('listen_configs').select('keywords, competitors, exclude, threshold').eq('workspace_id', workspaceId).maybeSingle(),
    db.from('brand_brains').select('keywords, competitors').eq('workspace_id', workspaceId).maybeSingle(),
  ]);
  return {
    keywords: (cfg?.keywords?.length ? cfg.keywords : (brain?.keywords ?? []).filter((k: string) => k.split(' ').length <= 4).slice(0, 6)) as string[],
    competitors: (cfg?.competitors ?? (brain?.competitors ?? []).slice(0, 3)) as string[],
    exclude: (cfg?.exclude ?? []) as string[],
    threshold: (cfg?.threshold ?? 60) as number,
  };
}
