import {
  BudgetExceededError, LAUNCH_PLAN_SYSTEM, LAUNCH_PLAN_VERSION, LAUNCH_POSTS_SYSTEM, LAUNCH_POSTS_VERSION,
  LaunchPlanSchema, LaunchPostsSchema, brandBlock, fastModel, findUnsupportedClaims, generate, launchPlanPrompt, launchPostsPrompt, mockLaunchPlan, mockLaunchPosts,
  type BrandContext,
} from '@shipitloud/ai';
import { brandContext as engineBrandContext, PlanLimitError } from '@shipitloud/engine';
import { aiLedger, check, db, enqueue } from './db.ts';

export { PlanLimitError } from '@shipitloud/engine';

/** The brand as the AI sees it (shared with the web app through the engine). */
export const brandContext = (workspaceId: string): Promise<BrandContext> => engineBrandContext(db, workspaceId);

async function consume(workspaceId: string, metric: 'ai_drafts' | 'images', amount: number) {
  const { data } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: metric, p_amount: amount, p_cost: 0 });
  if (!data) throw new PlanLimitError(metric === 'ai_drafts' ? 'Launch posts are part of the Launch Pass and Grow plans, or you’ve used this month’s AI drafts.' : 'You’ve used this month’s images.');
}

/** 9:00 UTC on launch day plus `days`. Null when no launch date is set (then nothing auto-schedules). */
function at(launchDate: string | null, days: number, hour = 9): string | null {
  if (!launchDate) return null;
  const d = new Date(`${launchDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour);
  return d.toISOString();
}

/** Launch posts for X, LinkedIn, Reddit, Product Hunt and WhatsApp, as drafts in the inbox. */
export async function makeLaunchPosts(workspaceId: string) {
  const ctx = await brandContext(workspaceId);
  await consume(workspaceId, 'ai_drafts', 7);
  const { data, model } = await generate({
    ledger: aiLedger, purpose: 'launch_posts', promptVersion: LAUNCH_POSTS_VERSION, workspaceId, model: fastModel(),
    system: LAUNCH_POSTS_SYSTEM, user: launchPostsPrompt(ctx), schema: LaunchPostsSchema, maxTokens: 2500, mock: () => mockLaunchPosts(ctx),
  });

  const base = { workspace_id: workspaceId, type: 'post', status: 'pending', prompt_version: LAUNCH_POSTS_VERSION, model, confidence: 88, qa_score: 90 };
  const rows = [
    { ...base, platform: 'x', title: 'Launch thread on X', scheduled_for: at(ctx.launch_date, 0, 15), content: { ref: 'x_thread', thread: data.x_thread, text: data.x_thread.join('\n\n— — —\n\n') } },
    { ...base, platform: 'linkedin', title: 'Founder story on LinkedIn', scheduled_for: at(ctx.launch_date, 0, 13), content: { ref: 'linkedin', text: data.linkedin } },
    { ...base, platform: 'reddit', title: `Reddit: ${data.reddit.title}`, scheduled_for: at(ctx.launch_date, 1, 14), content: { ref: 'reddit', title: data.reddit.title, text: data.reddit.body, subreddits: data.reddit.subreddits } },
    { ...base, platform: 'producthunt', title: 'Product Hunt listing', scheduled_for: at(ctx.launch_date, 0, 7), content: { ref: 'product_hunt', ...data.product_hunt, text: `${data.product_hunt.tagline}\n\n${data.product_hunt.description}\n\nFirst comment:\n${data.product_hunt.first_comment}` } },
    { ...base, platform: 'whatsapp', title: 'WhatsApp status', scheduled_for: at(ctx.launch_date, 0, 8), content: { ref: 'whatsapp', text: data.whatsapp.status } },
    { ...base, platform: 'whatsapp', title: 'WhatsApp message to your contacts', scheduled_for: at(ctx.launch_date, 0, 10), content: { ref: 'whatsapp', text: data.whatsapp.broadcast } },
  ];
  // Claim check: anything the brand brain doesn't back is flagged, so it always needs the founder.
  const facts = brandBlock(ctx);
  for (const r of rows) {
    const flags = findUnsupportedClaims(String(r.content.text), facts);
    Object.assign(r, { flags, confidence: flags.length ? 60 : r.confidence });
  }
  // A new set replaces the previous pending one, so the inbox never fills with duplicates.
  await db.from('assets').update({ status: 'rejected' }).eq('workspace_id', workspaceId).eq('type', 'post').eq('status', 'pending').eq('prompt_version', LAUNCH_POSTS_VERSION);
  const { data: inserted, error } = await db.from('assets').insert(rows).select('id');
  if (error) throw new Error(`save posts: ${error.message}`);
  for (const a of inserted ?? []) await enqueue(workspaceId, 'asset.intake', { asset_id: a.id }, { key: `intake:${a.id}` });
  return inserted?.length ?? 0;
}

/** The 30-day plan, tasks linked to the drafts that complete them. */
export async function makeLaunchPlan(workspaceId: string) {
  const ctx = await brandContext(workspaceId);
  const launchDate = ctx.launch_date ?? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  await db.from('launch_plans').upsert({ workspace_id: workspaceId, launch_date: launchDate, status: 'building', error: null, updated_at: new Date().toISOString() });
  try {
    await consume(workspaceId, 'ai_drafts', 1);
    const { data, model } = await generate({
      ledger: aiLedger, purpose: 'launch_plan', promptVersion: LAUNCH_PLAN_VERSION, workspaceId, model: fastModel(),
      system: LAUNCH_PLAN_SYSTEM, user: launchPlanPrompt({ ...ctx, launch_date: launchDate }), schema: LaunchPlanSchema, maxTokens: 3000, mock: () => mockLaunchPlan(),
    });
    // Link tasks to the newest asset for each ref.
    const { data: assets } = await db.from('assets').select('id, type, content, created_at').eq('workspace_id', workspaceId).neq('status', 'rejected').order('created_at', { ascending: false });
    const byRef = new Map<string, string>();
    for (const a of assets ?? []) {
      const ref = a.type === 'poster' ? 'posters' : (a.content as { ref?: string })?.ref;
      if (ref && !byRef.has(ref)) byRef.set(ref, a.id);
    }
    const tasks = data.tasks
      .map((t, i) => ({ id: `t${i}`, ...t, day: Math.max(-14, Math.min(15, Math.round(t.day))), asset_id: byRef.get(t.asset_ref) ?? null, done: false }))
      .sort((a, b) => a.day - b.day);
    check(await db.from('launch_plans').update({ tasks, status: 'ready', model, prompt_version: LAUNCH_PLAN_VERSION, updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId), 'save plan');
    return tasks.length;
  } catch (err) {
    const msg = err instanceof BudgetExceededError ? 'ShipItLoud’s AI budget for this month is used up.' : err instanceof Error ? err.message : String(err);
    await db.from('launch_plans').update({ status: 'failed', error: msg.slice(0, 300) }).eq('workspace_id', workspaceId);
    if (err instanceof BudgetExceededError || err instanceof PlanLimitError) return 0;
    throw err;
  }
}
