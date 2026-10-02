import type { NextRequest } from 'next/server';
import { PlanLimitError, draftReply } from '@shipitloud/engine';
import { extAuth, json, preflightResponse } from '@/lib/ext';

// Draft a reply in the founder's voice. It also lands in the approval inbox, like every other draft.
export async function POST(req: NextRequest) {
  const ctx = await extAuth(req);
  if (!('db' in ctx)) return ctx;
  const body = (await req.json().catch(() => null)) as { mention_id?: string } | null;
  const id = typeof body?.mention_id === 'string' ? body.mention_id : '';
  const { data: m } = await ctx.db.from('mentions').select('id').eq('id', id).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (!m) return json(req, { error: 'We couldn’t find that post. Refresh the page and try again.' }, 404);
  try {
    const r = await draftReply(ctx.db, ctx.workspaceId, id);
    return json(req, { asset_id: r.assetId, text: r.text, flags: r.flags });
  } catch (err) {
    if (err instanceof PlanLimitError) return json(req, { error: err.message }, 402);
    console.error('[ext draft]', err);
    return json(req, { error: 'Couldn’t draft a reply right now. Try again in a minute.' }, 500);
  }
}

export const OPTIONS = preflightResponse;
