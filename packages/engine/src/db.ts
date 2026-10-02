// Shared by the worker and the web app's server routes. Every function takes a service-role client
// (it bypasses RLS), so every query filters by workspace explicitly.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Ledger } from '@shipitloud/ai';

export type Db = SupabaseClient;

/** A plan cap was hit. Callers turn this into a friendly notice, not a retry. */
export class PlanLimitError extends Error {}

export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export async function enqueue(db: Db, workspaceId: string | null, type: string, payload: Record<string, unknown> = {}, opts: { runAt?: Date; key?: string } = {}) {
  check(await db.rpc('enqueue_job', { p_workspace: workspaceId, p_type: type, p_payload: payload, p_run_at: (opts.runAt ?? new Date()).toISOString(), p_key: opts.key ?? null }), `enqueue ${type}`);
}

/** AI spend ledger backed by the ai_calls table; the monthly budget is checked against it before every call. */
export function ledgerFor(db: Db): Ledger {
  return {
    async spentThisMonth() {
      const { data, error } = await db.rpc('ai_spend_this_month');
      if (error) throw new Error(`ai_spend_this_month: ${error.message}`);
      return Number(data ?? 0);
    },
    async record(row) {
      const { error } = await db.from('ai_calls').insert(row);
      if (error) console.error('[ai ledger]', error.message);
    },
  };
}

/** Successful AI calls of one kind for a workspace since midnight UTC (daily caps). */
export async function callsToday(db: Db, workspaceId: string, purpose: string) {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from('ai_calls').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('purpose', purpose).eq('ok', true).gte('created_at', since.toISOString());
  return count ?? 0;
}

export async function consume(db: Db, workspaceId: string, metric: 'ai_drafts' | 'images' | 'videos' | 'x_reads', amount = 1) {
  const { data } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: metric, p_amount: amount, p_cost: 0 });
  return !!data;
}
