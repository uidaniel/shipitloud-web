import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, type ActionRow, type ActionsRepo } from '@shipitloud/core';
import { need } from './env.ts';

// Service-role client: bypasses RLS, so every query below filters by workspace explicitly.
export const db: SupabaseClient = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export const actionsRepo: ActionsRepo = {
  async findAction(key) {
    return check(await db.from('actions').select('*').eq('idempotency_key', key).maybeSingle(), 'findAction') as ActionRow | null;
  },
  async insertAction(row) {
    const res = await db.from('actions').insert(row).select('*').single();
    if (res.error?.code === '23505') {
      return check(await db.from('actions').select('*').eq('idempotency_key', row.idempotency_key).single(), 'insertAction refetch') as ActionRow;
    }
    return check(res, 'insertAction') as ActionRow;
  },
  async getWorkspace(id) {
    return check(await db.from('workspaces').select('kill_switch').eq('id', id).maybeSingle(), 'getWorkspace');
  },
  async getAsset(id) {
    return check(await db.from('assets').select('workspace_id, status, undo_until').eq('id', id).maybeSingle(), 'getAsset');
  },
  async setAssetStatus(id, status) {
    check(await db.from('assets').update({ status, updated_at: new Date().toISOString() }).eq('id', id), 'setAssetStatus');
  },
  async getToken(workspaceId, provider) {
    const row = check(
      await db.from('connections').select('encrypted_token, status').eq('workspace_id', workspaceId).eq('provider', provider).maybeSingle(),
      'getToken',
    );
    if (!row?.encrypted_token || row.status !== 'active') return undefined;
    return decryptToken(row.encrypted_token);
  },
};

export async function enqueue(workspaceId: string | null, type: string, payload: Record<string, unknown> = {}, opts: { runAt?: Date; key?: string } = {}) {
  check(
    await db.rpc('enqueue_job', {
      p_workspace: workspaceId,
      p_type: type,
      p_payload: payload,
      p_run_at: (opts.runAt ?? new Date()).toISOString(),
      p_key: opts.key ?? null,
    }),
    `enqueue ${type}`,
  );
}

export { check };

// ---------------------------------------------------------------- AI spend ledger
import type { Ledger } from '@shipitloud/ai';

export const aiLedger: Ledger = {
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
