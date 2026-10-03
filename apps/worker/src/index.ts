// The worker: claims jobs from Postgres, runs them, retries with backoff, and does housekeeping.
// Every handler must be safe to run twice (PRD build rules); publish uses idempotency keys.
import './env.ts';
import { hostname } from 'node:os';
import { check, db } from './db.ts';
import { handlers, tick } from './handlers.ts';

const WORKER = `${hostname()}:${process.pid}`;
const once = process.argv.includes('--once');
let stopping = false;

interface Job { id: string; workspace_id: string | null; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number; created_at: string }

// Slow jobs get their own lane so a 7-minute video render never delays a 15-second analysis.
const HEAVY = ['kit.video', 'ugc.video', 'ugc.carousel', 'kit.readiness'];

async function runBatch(lane: 'fast' | 'heavy'): Promise<number> {
  const jobs = check(await db.rpc('claim_jobs_lane', { p_worker: WORKER, p_limit: lane === 'heavy' ? 1 : 5, p_types: HEAVY, p_only: lane === 'heavy' }), 'claim_jobs') as Job[];
  for (const job of jobs) {
    const handler = handlers[job.type];
    if (!handler) {
      // An older worker (e.g. mid-deploy) doesn't know this job type: hand it back for a newer one,
      // without using up an attempt. It only dies if no worker has picked it up for a day.
      const stale = Date.now() - Date.parse(job.created_at) > 86_400_000;
      await db.from('jobs').update(stale
        ? { status: 'dead', last_error: `No worker handles ${job.type}`, locked_at: null }
        : { status: 'queued', locked_at: null, locked_by: null, attempts: Math.max(0, job.attempts - 1), run_at: new Date(Date.now() + 15_000).toISOString() }).eq('id', job.id);
      console.warn(`[job ${job.type}] not handled by this worker; handed back`);
      continue;
    }
    try {
      await handler(job.payload, job);
      await db.from('jobs').update({ status: 'done', finished_at: new Date().toISOString(), last_error: null }).eq('id', job.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const dead = job.attempts >= job.max_attempts;
      const backoff = Math.min(60, 2 ** job.attempts) * 60_000; // 2, 4, 8 ... up to 60 minutes
      await db.from('jobs').update({
        status: dead ? 'dead' : 'queued',
        last_error: msg,
        locked_at: null,
        run_at: new Date(Date.now() + backoff).toISOString(),
      }).eq('id', job.id);
      console.error(`[job ${job.type}] ${dead ? 'DEAD' : 'retrying'}: ${msg}`);
    }
  }
  return jobs.length;
}

async function loop(lane: 'fast' | 'heavy') {
  let lastTick = 0;
  while (!stopping) {
    // Housekeeping runs on the fast lane only.
    if (lane === 'fast' && Date.now() - lastTick > 60_000) {
      lastTick = Date.now();
      await tick().catch((e) => console.error('[tick]', e instanceof Error ? e.message : e));
    }
    const n = await runBatch(lane).catch((e) => { console.error(`[batch:${lane}]`, e instanceof Error ? e.message : e); return 0; });
    if (once && n === 0) break;
    if (n === 0) await new Promise((r) => setTimeout(r, lane === 'heavy' ? 4000 : 2000));
  }
}

async function main() {
  console.log(`[worker] ${WORKER} started${once ? ' (once)' : ''}`);
  await Promise.all([loop('fast'), loop('heavy')]);
  console.log('[worker] stopped');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true; });
await main();
