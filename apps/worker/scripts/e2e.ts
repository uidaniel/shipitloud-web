// End-to-end check of the foundation loop on the real database, then cleans up.
// draft -> intake (manual: notify founder) -> approve -> decided -> publish via actions service -> audit row
// trust mode: matching scheduled post auto-approves with an undo window.
import '../src/env.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { db, enqueue } from '../src/db.ts';

const runWorker = () => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts', '--once'], { cwd: process.cwd(), encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout + r.stderr;
};

const email = `e2e+${Date.now()}@shipitloud.test`;
const { data: u, error: ue } = await db.auth.admin.createUser({ email, email_confirm: true });
if (ue) throw ue;
const userId = u.user!.id;
let wsId = '';
try {
  const { data: ws, error: we } = await db.from('workspaces').insert({ owner_id: userId, product_name: 'E2E Test' }).select('id').single();
  if (we) throw we;
  wsId = ws.id;

  // 1. Manual mode: a draft lands in the inbox and the founder is notified.
  const { data: a1 } = await db.from('assets').insert({ workspace_id: wsId, type: 'post', platform: 'x', title: 'Launch post', content: { text: 'We launched!' }, confidence: 95 }).select('id').single();
  await enqueue(wsId, 'asset.intake', { asset_id: a1!.id });
  console.log(runWorker().trim().split('\n').filter((l) => l.includes('email:dev')).join('\n'));
  const n1 = await db.from('notifications').select('kind, title, channels').eq('workspace_id', wsId);
  assert.equal(n1.data?.[0]?.kind, 'pending_approval');
  assert.deepEqual(n1.data?.[0]?.channels, ['email']);
  assert.equal((await db.from('assets').select('status').eq('id', a1!.id).single()).data?.status, 'pending');
  console.log('ok  manual: draft waits in the inbox, founder notified');

  // 2. Founder approves -> publish through the actions service -> copy-and-post (no X API access yet).
  await db.from('assets').update({ status: 'approved' }).eq('id', a1!.id);
  await db.from('approvals').insert({ workspace_id: wsId, asset_id: a1!.id, status: 'approved', decided_by: userId });
  await enqueue(wsId, 'asset.decided', { asset_id: a1!.id });
  runWorker();
  const act = await db.from('actions').select('status, kind, provider, result').eq('workspace_id', wsId).single();
  assert.equal(act.data?.status, 'copy_and_post');
  assert.match(JSON.stringify(act.data?.result), /x\.com\/intent\/post/);
  assert.equal((await db.from('assets').select('status').eq('id', a1!.id).single()).data?.status, 'scheduled');
  console.log('ok  approve: published via actions service as copy-and-post, audited');

  // 3. Trust mode: the same kind of post, scheduled and confident, auto-approves with an undo window.
  await db.from('workspaces').update({ trust_mode: 'trust' }).eq('id', wsId);
  const { data: a2 } = await db.from('assets').insert({ workspace_id: wsId, type: 'post', platform: 'x', title: 'Tuesday tip', content: { text: 'Tip' }, confidence: 91, scheduled_for: new Date(Date.now() + 3600_000).toISOString() }).select('id').single();
  await enqueue(wsId, 'asset.intake', { asset_id: a2!.id });
  runWorker();
  const s2 = (await db.from('assets').select('status, undo_until').eq('id', a2!.id).single()).data;
  assert.equal(s2?.status, 'auto_approved');
  assert.ok(s2?.undo_until);
  const pub = (await db.from('jobs').select('run_at').eq('idempotency_key', `publish:${a2!.id}`).single()).data;
  assert.ok(pub && Date.parse(pub.run_at) >= Date.now() + 3500_000, 'publish waits for its scheduled time');
  console.log('ok  trust: scheduled post auto-approved, undo window set, publish queued for its time');

  // 4. A reply never auto-approves in trust mode.
  const { data: a3 } = await db.from('assets').insert({ workspace_id: wsId, type: 'reply', platform: 'reddit', title: 'Reply', content: { text: 'Hi' }, confidence: 99 }).select('id').single();
  await enqueue(wsId, 'asset.intake', { asset_id: a3!.id });
  runWorker();
  assert.equal((await db.from('assets').select('status').eq('id', a3!.id).single()).data?.status, 'pending');
  console.log('ok  trust: public replies still wait for the founder');

  // 5. Kill switch blocks publishing even after approval.
  await db.from('workspaces').update({ kill_switch: true }).eq('id', wsId);
  await db.from('assets').update({ status: 'approved' }).eq('id', a3!.id);
  await enqueue(wsId, 'asset.publish', { asset_id: a3!.id });
  runWorker();
  const blocked = (await db.from('actions').select('status, reason').eq('asset_id', a3!.id).single()).data;
  assert.deepEqual([blocked?.status, blocked?.reason], ['blocked', 'Kill switch is on']);
  console.log('ok  kill switch: approved reply blocked and audited');
} finally {
  if (wsId) {
    await db.from('jobs').delete().eq('workspace_id', wsId);
    await db.from('workspaces').delete().eq('id', wsId);
  }
  await db.auth.admin.deleteUser(userId);
  console.log('cleaned up');
}
