import type { NextRequest } from 'next/server';
import { extAuth, json, listenTerms, preflightResponse } from '@/lib/ext';
import { smartLinks } from '@/lib/smart-links';

// Who the extension is connected as, plus today's searches for the popup.
export async function GET(req: NextRequest) {
  const ctx = await extAuth(req);
  if (!('db' in ctx)) return ctx;
  const terms = await listenTerms(ctx.db, ctx.workspaceId);
  const { data: post } = await ctx.db.from('assets').select('content').eq('workspace_id', ctx.workspaceId).eq('prompt_version', 'launch_posts@1').eq('platform', 'reddit').limit(1).maybeSingle();
  const subs = ((post?.content as { subreddits?: string[] } | null)?.subreddits ?? []);
  const { data: cap } = await ctx.db.from('plan_limits').select('monthly_cap').eq('plan', ctx.plan).eq('metric', 'monitors').maybeSingle();
  return json(req, {
    workspace: { id: ctx.workspaceId, name: ctx.name, url: ctx.url, plan: ctx.plan },
    listening: (cap?.monthly_cap ?? 0) > 0,
    threshold: terms.threshold,
    keywords: terms.keywords,
    links: smartLinks(terms, subs, ctx.plan).filter((l) => l.icon === 'reddit'),
  });
}

export const OPTIONS = preflightResponse;
