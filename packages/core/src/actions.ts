// The actions service (PRD section 19): every external action (post, send, spend) goes through
// execute(). It checks idempotency, the kill switch, approval status and undo windows, spend caps,
// then calls the provider and writes an audit row whether or not anything happened.
import { copyAndPost, getProvider, type ProviderResult } from './providers.ts';

export type ActionKind = 'post' | 'send' | 'spend';
export type ActionStatus = 'executed' | 'simulated' | 'copy_and_post' | 'blocked' | 'failed';

export interface ActionRow {
  id: string;
  workspace_id: string;
  asset_id: string | null;
  kind: ActionKind;
  provider: string;
  idempotency_key: string;
  status: ActionStatus;
  reason: string | null;
  amount_cents: number | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface ActionRequest {
  workspaceId: string;
  assetId?: string | null;
  kind: ActionKind;
  provider: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  amountCents?: number;
  /** For spend: the hard caps and what's already spent today / in total. */
  spend?: { dailyCapCents: number; totalCapCents: number; spentTodayCents: number; spentTotalCents: number };
}

/** Storage the service needs. The worker implements it with Supabase; tests use memory. */
export interface ActionsRepo {
  findAction(key: string): Promise<ActionRow | null>;
  /** Insert; if the key already exists, return the existing row (race-safe idempotency). */
  insertAction(row: Omit<ActionRow, 'id'>): Promise<ActionRow>;
  getWorkspace(id: string): Promise<{ kill_switch: boolean } | null>;
  getAsset(id: string): Promise<{ workspace_id: string; status: string; undo_until: string | null } | null>;
  setAssetStatus(id: string, status: 'published' | 'failed' | 'scheduled'): Promise<void>;
  getToken(workspaceId: string, provider: string): Promise<string | undefined>;
}

export interface ActionsOptions {
  /** Test mode: never touch real platforms. Defaults to true unless ACTIONS_MODE=live. */
  simulate?: boolean;
  now?: () => Date;
}

export async function execute(repo: ActionsRepo, req: ActionRequest, opts: ActionsOptions = {}): Promise<ActionRow> {
  const now = opts.now?.() ?? new Date();
  const simulate = opts.simulate ?? process.env.ACTIONS_MODE !== 'live';

  const existing = await repo.findAction(req.idempotencyKey);
  if (existing) return existing;

  const base = {
    workspace_id: req.workspaceId,
    asset_id: req.assetId ?? null,
    kind: req.kind,
    provider: req.provider,
    idempotency_key: req.idempotencyKey,
    amount_cents: req.amountCents ?? null,
    payload: req.payload,
  };
  const record = (status: ActionStatus, reason: string | null, result: Record<string, unknown> = {}) =>
    repo.insertAction({ ...base, status, reason, result });

  const ws = await repo.getWorkspace(req.workspaceId);
  if (!ws) return record('blocked', 'Workspace not found');
  if (ws.kill_switch) return record('blocked', 'Kill switch is on');

  if (req.assetId) {
    const asset = await repo.getAsset(req.assetId);
    if (!asset || asset.workspace_id !== req.workspaceId) return record('blocked', 'Asset not found in this workspace');
    if (asset.status !== 'approved' && asset.status !== 'auto_approved' && asset.status !== 'scheduled') {
      return record('blocked', `Not approved (status: ${asset.status})`);
    }
    if (asset.status === 'auto_approved' && asset.undo_until && new Date(asset.undo_until) > now) {
      return record('blocked', 'Still inside the undo window');
    }
  } else if (req.kind !== 'spend') {
    return record('blocked', 'Posts and sends need an approved asset');
  }

  if (req.kind === 'spend') {
    const amt = req.amountCents ?? 0;
    const s = req.spend;
    if (!s) return record('blocked', 'Spend without caps');
    if (amt <= 0) return record('blocked', 'Spend amount must be positive');
    if (s.spentTodayCents + amt > s.dailyCapCents) return record('blocked', 'Would exceed the daily cap');
    if (s.spentTotalCents + amt > s.totalCapCents) return record('blocked', 'Would exceed the total cap');
  }

  const provider = getProvider(req.provider);
  if (simulate && provider.automatic) {
    const row = await record('simulated', 'Test mode: nothing was sent', { simulated: true });
    if (req.assetId) await repo.setAssetStatus(req.assetId, 'published');
    return row;
  }

  let result: ProviderResult;
  try {
    const token = provider.automatic ? await repo.getToken(req.workspaceId, req.provider) : undefined;
    if (provider.automatic && !token) {
      // API exists but this workspace hasn't connected it: fall back to copy and post.
      result = await copyAndPost(req.provider).execute(req.payload, { simulate });
    } else {
      result = await provider.execute(req.payload, { token, simulate });
    }
  } catch (err) {
    const row = await record('failed', err instanceof Error ? err.message : String(err));
    if (req.assetId) await repo.setAssetStatus(req.assetId, 'failed');
    return row;
  }

  if (result.copyAndPost) {
    // The founder finishes it by hand; the asset stays "scheduled" until they mark it done.
    const row = await record('copy_and_post', 'No API access yet: copy and post', { ...result });
    if (req.assetId) await repo.setAssetStatus(req.assetId, 'scheduled');
    return row;
  }
  const row = await record('executed', null, { ...result });
  if (req.assetId) await repo.setAssetStatus(req.assetId, 'published');
  return row;
}
