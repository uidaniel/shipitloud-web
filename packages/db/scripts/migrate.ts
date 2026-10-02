// Applies packages/db/migrations/*.sql in order, once each, inside a transaction per file.
// Usage: npm run db:migrate            (reads DATABASE_URL from the repo-root .env.local)
//        npm run db:migrate -- --dry   (lists pending migrations only)
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const dir = join(here, '..', 'migrations');

function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}

const url = env('DATABASE_URL');
if (!url) {
  console.error('DATABASE_URL is not set (repo-root .env.local).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
// Kept out of the public schema so the Supabase API never exposes it.
await client.query(`create schema if not exists ops; create table if not exists ops.migrations (name text primary key, applied_at timestamptz not null default now())`);
const done = new Set((await client.query<{ name: string }>('select name from ops.migrations')).rows.map((r) => r.name));
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const pending = files.filter((f) => !done.has(f));

if (process.argv.includes('--dry')) {
  console.log(pending.length ? `Pending:\n  ${pending.join('\n  ')}` : 'Up to date.');
} else {
  for (const f of pending) {
    process.stdout.write(`Applying ${f} ... `);
    try {
      await client.query('begin');
      await client.query(readFileSync(join(dir, f), 'utf8'));
      await client.query('insert into ops.migrations (name) values ($1)', [f]);
      await client.query('commit');
      console.log('ok');
    } catch (err) {
      await client.query('rollback');
      console.log('FAILED');
      console.error(err instanceof Error ? err.message : err);
      await client.end();
      process.exit(1);
    }
  }
  if (!pending.length) console.log('Up to date.');
}
await client.end();
