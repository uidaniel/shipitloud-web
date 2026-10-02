import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decideTrust, type TrustInput, type TrustSettings } from './trust.ts';
import { execute, type ActionRow, type ActionsRepo } from './actions.ts';
import { registerProvider } from './providers.ts';
import { decryptToken, encryptToken } from './crypto.ts';

// ---------------------------------------------------------------- trust mode
const post: TrustInput = { type: 'post', platform: 'x', confidence: 92, flags: [], scheduled: true, matchesApprovedTopic: true };
const trust: TrustSettings = { trust_mode: 'trust', trust_threshold: 85, kill_switch: false };

test('manual mode never auto-approves', () => {
  assert.equal(decideTrust(post, { ...trust, trust_mode: 'manual' }).auto, false);
});
test('trust mode auto-approves scheduled posts above the threshold', () => {
  assert.equal(decideTrust(post, trust).auto, true);
  assert.equal(decideTrust({ ...post, confidence: 84 }, trust).auto, false);
});
test('flags, new topics and unscheduled items still need the founder', () => {
  assert.equal(decideTrust({ ...post, flags: ['claim'] }, trust).auto, false);
  assert.equal(decideTrust({ ...post, matchesApprovedTopic: false }, trust).auto, false);
  assert.equal(decideTrust({ ...post, scheduled: false }, trust).auto, false);
});
test('replies need the founder in trust mode; full trust only on low-risk platforms', () => {
  const reply: TrustInput = { type: 'reply', platform: 'hn', confidence: 95, flags: [] };
  assert.equal(decideTrust(reply, trust).auto, false);
  assert.equal(decideTrust(reply, { ...trust, trust_mode: 'full' }).auto, true);
  assert.equal(decideTrust({ ...reply, platform: 'reddit' }, { ...trust, trust_mode: 'full' }).auto, false);
  assert.equal(decideTrust({ ...reply, platform: 'x' }, { ...trust, trust_mode: 'full' }).auto, false);
});
test('ads and the kill switch block every mode', () => {
  assert.equal(decideTrust({ ...post, type: 'ad_creative' }, { ...trust, trust_mode: 'full' }).auto, false);
  assert.equal(decideTrust({ ...post, type: 'article' }, { ...trust, trust_mode: 'full' }).reason, 'Articles always need you');
  assert.equal(decideTrust(post, { ...trust, trust_mode: 'full', kill_switch: true }).auto, false);
});

// ---------------------------------------------------------------- actions service
function memoryRepo(opts: { kill?: boolean; assetStatus?: string; undoUntil?: string | null; token?: string } = {}) {
  const actions = new Map<string, ActionRow>();
  const asset = { workspace_id: 'ws', status: opts.assetStatus ?? 'approved', undo_until: opts.undoUntil ?? null };
  const repo: ActionsRepo & { actions: Map<string, ActionRow>; asset: typeof asset } = {
    actions,
    asset,
    async findAction(k) { return actions.get(k) ?? null; },
    async insertAction(row) {
      const hit = actions.get(row.idempotency_key);
      if (hit) return hit;
      const r = { ...row, id: String(actions.size + 1) };
      actions.set(row.idempotency_key, r);
      return r;
    },
    async getWorkspace() { return { kill_switch: !!opts.kill }; },
    async getAsset(id) { return id === 'a1' ? asset : null; },
    async setAssetStatus(_id, s) { asset.status = s; },
    async getToken() { return opts.token; },
  };
  return repo;
}
const req = { workspaceId: 'ws', assetId: 'a1', kind: 'post' as const, provider: 'x', payload: { text: 'hi' }, idempotencyKey: 'k1' };

test('approved post with no API access becomes copy-and-post with a compose link', async () => {
  const repo = memoryRepo();
  const row = await execute(repo, req);
  assert.equal(row.status, 'copy_and_post');
  assert.match(String((row.result as { copyAndPost?: { openUrl: string } }).copyAndPost?.openUrl), /x\.com\/intent\/post\?text=hi/);
  assert.equal(repo.asset.status, 'scheduled');
});

test('idempotent: same key never acts twice', async () => {
  const repo = memoryRepo();
  const a = await execute(repo, req);
  const b = await execute(repo, req);
  assert.equal(a.id, b.id);
  assert.equal(repo.actions.size, 1);
});

test('kill switch and unapproved assets are blocked and still audited', async () => {
  const k = await execute(memoryRepo({ kill: true }), req);
  assert.deepEqual([k.status, k.reason], ['blocked', 'Kill switch is on']);
  const p = await execute(memoryRepo({ assetStatus: 'pending' }), req);
  assert.equal(p.status, 'blocked');
});

test('auto-approved items wait out the undo window', async () => {
  const now = new Date('2026-10-02T10:00:00Z');
  const inside = await execute(memoryRepo({ assetStatus: 'auto_approved', undoUntil: '2026-10-02T10:10:00Z' }), req, { now: () => now });
  assert.equal(inside.reason, 'Still inside the undo window');
  const after = await execute(memoryRepo({ assetStatus: 'auto_approved', undoUntil: '2026-10-02T09:50:00Z' }), req, { now: () => now });
  assert.equal(after.status, 'copy_and_post');
});

test('spend never exceeds daily or total caps', async () => {
  const spend = { workspaceId: 'ws', kind: 'spend' as const, provider: 'meta', payload: {}, idempotencyKey: 's1', amountCents: 600 };
  const caps = { dailyCapCents: 1000, totalCapCents: 5000, spentTodayCents: 500, spentTotalCents: 0 };
  assert.equal((await execute(memoryRepo(), { ...spend, spend: caps })).reason, 'Would exceed the daily cap');
  assert.equal((await execute(memoryRepo(), { ...spend, spend: { ...caps, spentTodayCents: 0, spentTotalCents: 4500 } })).reason, 'Would exceed the total cap');
  assert.equal((await execute(memoryRepo(), { ...spend })).reason, 'Spend without caps');
});

test('automatic providers are simulated in test mode, live only with a token', async () => {
  let calls = 0;
  registerProvider({ id: 'fakeapi', automatic: true, async execute() { calls++; return { externalId: 'e1' }; } });
  const sim = await execute(memoryRepo({ token: 't' }), { ...req, provider: 'fakeapi', idempotencyKey: 'f1' }, { simulate: true });
  assert.deepEqual([sim.status, calls], ['simulated', 0]);
  const live = await execute(memoryRepo({ token: 't' }), { ...req, provider: 'fakeapi', idempotencyKey: 'f2' }, { simulate: false });
  assert.deepEqual([live.status, calls], ['executed', 1]);
  const noToken = await execute(memoryRepo(), { ...req, provider: 'fakeapi', idempotencyKey: 'f3' }, { simulate: false });
  assert.equal(noToken.status, 'copy_and_post');
});

test('internal providers publish in test mode without a token, but still obey the kill switch', async () => {
  let calls = 0;
  registerProvider({ id: 'fakeblog', automatic: true, internal: true, async execute() { calls++; return { url: '/blog/x/post' }; } });
  const repo = memoryRepo();
  const row = await execute(repo, { ...req, provider: 'fakeblog', idempotencyKey: 'i1' }, { simulate: true });
  assert.deepEqual([row.status, calls, repo.asset.status], ['executed', 1, 'published']);
  const killed = await execute(memoryRepo({ kill: true }), { ...req, provider: 'fakeblog', idempotencyKey: 'i2' }, { simulate: true });
  assert.deepEqual([killed.status, calls], ['blocked', 1]);
});

test('a provider error is recorded as failed', async () => {
  registerProvider({ id: 'boom', automatic: true, async execute() { throw new Error('rate limited'); } });
  const repo = memoryRepo({ token: 't' });
  const row = await execute(repo, { ...req, provider: 'boom', idempotencyKey: 'b1' }, { simulate: false });
  assert.deepEqual([row.status, row.reason, repo.asset.status], ['failed', 'rate limited', 'failed']);
});

// ---------------------------------------------------------------- token encryption
test('tokens round-trip and tampering is detected', () => {
  const k = randomBytes(32).toString('hex');
  const sealed = encryptToken('oauth-secret', k);
  assert.ok(!sealed.includes('oauth-secret'));
  assert.equal(decryptToken(sealed, k), 'oauth-secret');
  const [v, iv, tag, ct] = sealed.split('.');
  const flipped = Buffer.from(ct!, 'base64');
  flipped[0] = (flipped[0] ?? 0) ^ 1;
  assert.throws(() => decryptToken([v, iv, tag, flipped.toString('base64')].join('.'), k));
});
