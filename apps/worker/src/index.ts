// The worker: claims jobs from Postgres, runs them, retries with backoff, and does housekeeping.
// Every handler must be safe to run twice (PRD build rules); publish uses idempotency keys.
import './env.ts';
import { hostname } from 'node:os';
import { check, db } from './db.ts';
import { handlers, tick } from './handlers.ts';

const WORKER = `${hostname()}:${process.pid}`;
const once = process.argv.includes('--once');
let stopping = false;

interface Job { id: string; workspace_id: string | null; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }

async function runBatch(): Promise<number> {
  const jobs = check(await db.rpc('claim_jobs', { p_worker: WORKER, p_limit: 5 }), 'claim_jobs') as Job[];
  for (const job of jobs) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for ${job.type}`);
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

async function main() {
  console.log(`[worker] ${WORKER} started${once ? ' (once)' : ''}`);
  let lastTick = 0;
  while (!stopping) {
    if (Date.now() - lastTick > 60_000) {
      lastTick = Date.now();
      await tick().catch((e) => console.error('[tick]', e instanceof Error ? e.message : e));
    }
    const n = await runBatch().catch((e) => { console.error('[batch]', e instanceof Error ? e.message : e); return 0; });
    if (once && n === 0) break;
    if (n === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('[worker] stopped');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true; });
await main();
