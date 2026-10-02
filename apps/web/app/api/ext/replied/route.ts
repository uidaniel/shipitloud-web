import type { NextRequest } from 'next/server';
import { extAuth, json, preflightResponse } from '@/lib/ext';

// The founder posted the reply themselves on Reddit. Close the loop: conversation replied, draft published,
// and keep the final wording they actually used.
export async function POST(req: NextRequest) {
  const ctx = await extAuth(req);
  if (!('db' in ctx)) return ctx;
  const b = (await req.json().catch(() => ({}))) as { mention_id?: string; text?: string };
  const { data: m } = await ctx.db.from('mentions').select('id, draft_asset_id').eq('id', String(b.mention_id ?? '')).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (!m) return json(req, { error: 'Not found.' }, 404);
  await ctx.db.from('mentions').update({ status: 'replied' }).eq('id', m.id);
  if (m.draft_asset_id) {
    const { data: a } = await ctx.db.from('assets').select('content').eq('id', m.draft_asset_id).single();
    const content = { ...(a?.content as Record<string, unknown>), ...(typeof b.text === 'string' && b.text.trim() ? { text: b.text.slice(0, 10_000), edited_in_extension: true } : {}), posted_via: 'extension' };
    await ctx.db.from('assets').update({ status: 'published', content, updated_at: new Date().toISOString() }).eq('id', m.draft_asset_id);
    // Audit log: posted by the founder's own hand (copy and post), never by us.
    const { error } = await ctx.db.from('actions').insert({
      workspace_id: ctx.workspaceId, asset_id: m.draft_asset_id, kind: 'post', provider: 'reddit', idempotency_key: `ext-replied:${m.draft_asset_id}`,
      status: 'copy_and_post', result: { by: 'founder', via: 'extension', thread: m.id },
    });
    if (error && error.code !== '23505') console.error('[ext replied] audit log:', error.message);
  }
  return json(req, { ok: true });
}

export const OPTIONS = preflightResponse;
