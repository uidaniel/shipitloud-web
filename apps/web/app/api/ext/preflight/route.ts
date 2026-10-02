import type { NextRequest } from 'next/server';
import { preflight, type PreflightInput } from '@shipitloud/engine';
import { extAuth, json, preflightResponse } from '@/lib/ext';

// Safety pre-flight: the extension sends what the founder's browser read (rules, their own history); we decide.
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function POST(req: NextRequest) {
  const ctx = await extAuth(req);
  if (!('db' in ctx)) return ctx;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acc = b.account as Record<string, unknown> | null | undefined;
  const input: PreflightInput = {
    subreddit: s(b.subreddit, 60),
    rules: (Array.isArray(b.rules) ? b.rules : []).slice(0, 30).map((r) => ({ short_name: s((r as Record<string, unknown>).short_name, 200), description: s((r as Record<string, unknown>).description, 1000) })),
    account: acc && typeof acc.name === 'string' ? { name: s(acc.name, 60), karma: Number(acc.karma) || 0, created_utc: Number(acc.created_utc) || Date.now() / 1000 } : null,
    recent: (Array.isArray(b.recent) ? b.recent : []).slice(0, 100).map((r) => { const o = r as Record<string, unknown>; return { subreddit: s(o.subreddit, 60), text: s(o.text, 2000), url: s(o.url, 500), removed: o.removed === true }; }),
    reply: s(b.reply, 10_000),
    brand: { name: ctx.name, url: ctx.url },
  };
  if (!input.subreddit) return json(req, { error: 'Missing subreddit.' }, 400);
  const result = preflight(input);
  const mentionId = typeof b.mention_id === 'string' ? b.mention_id : null;
  await ctx.db.from('safety_checks').insert({
    workspace_id: ctx.workspaceId, mention_id: mentionId, platform: 'reddit', community: input.subreddit, rule_summary: result.ruleSummary,
    self_promo_ratio: result.selfPromoRatio, past_removals: result.pastRemovals, verdict: result.verdict, reasons: result.reasons,
  });
  return json(req, result);
}

export const OPTIONS = preflightResponse;
