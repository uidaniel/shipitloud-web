// Security tests against the real database. Each test runs in a transaction that is rolled back.
// Run: npm test -w @shipitloud/db
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL ?? readFileSync(join(import.meta.dirname, '..', '..', '..', '.env.local'), 'utf8').match(/^DATABASE_URL=(.*)$/m)?.[1];
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

before(() => client.connect());
after(() => client.end());

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

async function tx(fn: () => Promise<void>) {
  await client.query('begin');
  try {
    await client.query(`insert into auth.users (id, email, aud, role) values ($1, 'a@test.dev', 'authenticated', 'authenticated'), ($2, 'b@test.dev', 'authenticated', 'authenticated')`, [A, B]);
    await fn();
  } finally {
    await client.query('rollback');
  }
}
async function as(user: string | null) {
  await client.query('reset role');
  if (user) {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated' })]);
    await client.query('set local role authenticated');
  }
}
// Expected failures run inside a savepoint so the surrounding transaction stays usable.
async function rejects(sql: string, params: unknown[], re: RegExp) {
  await client.query('savepoint s');
  await assert.rejects(client.query(sql, params), re);
  await client.query('rollback to savepoint s');
}
async function workspaceFor(user: string) {
  await as(user);
  const { rows } = await client.query(`insert into workspaces (owner_id, product_name) values ($1, 'Test') returning id`, [user]);
  return rows[0].id as string;
}

test('new auth user gets a profile', () => tx(async () => {
  const { rows } = await client.query('select email from profiles where id = $1', [A]);
  assert.equal(rows[0]?.email, 'a@test.dev');
}));

test('workspaces are private to their owner', () => tx(async () => {
  const ws = await workspaceFor(A);
  await as(B);
  assert.equal((await client.query('select 1 from workspaces where id = $1', [ws])).rowCount, 0);
  await as(A);
  assert.equal((await client.query('select 1 from workspaces where id = $1', [ws])).rowCount, 1);
}));

test('cannot create a workspace for someone else', () => tx(async () => {
  await as(A);
  await assert.rejects(client.query(`insert into workspaces (owner_id, product_name) values ($1, 'x')`, [B]), /row-level security/);
}));

test('assets: owner reads and writes, others see nothing and cannot insert', () => tx(async () => {
  const ws = await workspaceFor(A);
  await client.query(`insert into assets (workspace_id, type, title) values ($1, 'post', 'hello')`, [ws]);
  await as(B);
  assert.equal((await client.query('select 1 from assets where workspace_id = $1', [ws])).rowCount, 0);
  await rejects(`insert into assets (workspace_id, type, title) values ($1, 'post', 'x')`, [ws], /row-level security/);
}));

test('actions, jobs and usage are read-only for the owner', () => tx(async () => {
  const ws = await workspaceFor(A);
  await rejects(`insert into actions (workspace_id, kind, provider, idempotency_key, status) values ($1,'post','x','k','executed')`, [ws], /row-level security/);
  await rejects(`insert into usage (workspace_id, period) values ($1, current_date)`, [ws], /row-level security/);
}));

test('connection tokens are never readable from the browser role', () => tx(async () => {
  const ws = await workspaceFor(A);
  await as(null);
  await client.query(`insert into connections (workspace_id, provider, encrypted_token) values ($1, 'x', 'secret')`, [ws]);
  await as(A);
  assert.equal((await client.query('select provider from connections where workspace_id = $1', [ws])).rowCount, 1);
  await rejects('select encrypted_token from connections', [], /permission denied/);
}));

test('consume_usage enforces plan caps atomically', () => tx(async () => {
  const ws = await workspaceFor(A);
  await as(null);
  for (let i = 0; i < 5; i++) assert.equal((await client.query(`select consume_usage($1, 'images') ok`, [ws])).rows[0].ok, true);
  assert.equal((await client.query(`select consume_usage($1, 'images') ok`, [ws])).rows[0].ok, false);
  assert.equal((await client.query(`select consume_usage($1, 'videos') ok`, [ws])).rows[0].ok, false, 'free plan has no videos');
  const { rows } = await client.query('select images from usage where workspace_id = $1', [ws]);
  assert.equal(rows[0].images, 5);
}));

test('browser role cannot call consume_usage or claim_jobs', () => tx(async () => {
  const ws = await workspaceFor(A);
  await rejects(`select consume_usage($1, 'images')`, [ws], /permission denied/);
  await rejects(`select * from claim_jobs('w')`, [], /permission denied/);
}));

test('enqueue_job: owner can, others cannot; idempotent on key', () => tx(async () => {
  const ws = await workspaceFor(A);
  const id1 = (await client.query(`select enqueue_job($1, 'test', '{}'::jsonb, now(), 'k1') id`, [ws])).rows[0].id;
  const id2 = (await client.query(`select enqueue_job($1, 'test', '{}'::jsonb, now(), 'k1') id`, [ws])).rows[0].id;
  assert.equal(id1, id2);
  await as(B);
  await rejects(`select enqueue_job($1, 'test')`, [ws], /not allowed/);
}));

test('claim_jobs hands each job to one worker only', () => tx(async () => {
  const ws = await workspaceFor(A);
  await as(null);
  await client.query(`select enqueue_job($1, 'test'), enqueue_job($1, 'test'), enqueue_job($1, 'test')`, [ws]);
  const first = await client.query(`select id from claim_jobs('w1', 2)`);
  const second = await client.query(`select id from claim_jobs('w2', 5) where workspace_id = $1`, [ws]);
  assert.equal(first.rowCount, 2);
  assert.equal(second.rowCount, 1);
}));
