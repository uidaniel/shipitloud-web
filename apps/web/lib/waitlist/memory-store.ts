import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { JoinInput, JoinResult, WaitlistStats, WaitlistStatus, WaitlistStore } from './types.ts';

// Dev/test store with the same rules as the SQL functions in packages/db/migrations/0001_waitlist.sql.
// Persists to a JSON file when given a path; otherwise memory only.

interface Row {
  pageSlug: string;
  email: string;
  emailNormalized: string;
  consent: boolean;
  consentText: string;
  code: string;
  referrerCode: string | null;
  referralCount: number;
  position: number;
  productUrl: string | null;
  source: string;
  campaign: string | null;
  ipHash: string | null;
  flagged: boolean;
  createdAt: string;
}

export function rankOf(rows: Pick<Row, 'code' | 'position' | 'referralCount'>[], me: Pick<Row, 'code' | 'position' | 'referralCount'>, boost: number): number {
  const score = (r: Pick<Row, 'position' | 'referralCount'>) => r.position - boost * r.referralCount;
  const mine = score(me);
  let ahead = 0;
  for (const o of rows) {
    if (o.code === me.code) continue;
    const s = score(o);
    if (s < mine || (s === mine && o.position < me.position)) ahead++;
  }
  return ahead + 1;
}

export class MemoryWaitlistStore implements WaitlistStore {
  private rows: Row[] | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly filePath: string | undefined;

  constructor(filePath?: string) {
    this.filePath = filePath;
  }

  // With a file, always re-read: Next runs route handlers and pages in separate module
  // instances, so an in-memory cache would go stale.
  private async load(): Promise<Row[]> {
    if (!this.filePath) return (this.rows ??= []);
    try {
      this.rows = JSON.parse(await readFile(this.filePath, 'utf8')) as Row[];
    } catch {
      this.rows = [];
    }
    return this.rows;
  }

  private async save(): Promise<void> {
    if (!this.filePath || !this.rows) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.rows, null, 2));
  }

  // Serialize writes so positions stay unique, like the row lock in SQL.
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private statusOf(rows: Row[], me: Row, boost: number): WaitlistStatus {
    const page = rows.filter((r) => r.pageSlug === me.pageSlug);
    return { code: me.code, position: rankOf(page, me, boost), referrals: me.referralCount, total: page.length };
  }

  join(input: JoinInput): Promise<JoinResult> {
    return this.exclusive(async () => {
      const rows = await this.load();
      const page = rows.filter((r) => r.pageSlug === input.pageSlug);

      const existing = page.find((r) => r.emailNormalized === input.emailNormalized);
      if (existing) return { existing: true, ...this.statusOf(rows, existing, input.boost) };

      let flagged = false;
      let referrerCode: string | null = null;
      const referrer = input.refCode ? page.find((r) => r.code === input.refCode) : undefined;
      if (referrer) {
        referrerCode = referrer.code;
        if (referrer.ipHash && referrer.ipHash === input.ipHash) flagged = true;
        else referrer.referralCount++;
      }

      const row: Row = {
        pageSlug: input.pageSlug,
        email: input.email,
        emailNormalized: input.emailNormalized,
        consent: input.consent,
        consentText: input.consentText,
        code: input.code,
        referrerCode,
        referralCount: 0,
        position: page.reduce((max, r) => Math.max(max, r.position), 0) + 1,
        productUrl: input.productUrl,
        source: input.source,
        campaign: input.campaign,
        ipHash: input.ipHash,
        flagged,
        createdAt: new Date().toISOString(),
      };
      rows.push(row);
      await this.save();
      return { existing: false, ...this.statusOf(rows, row, input.boost) };
    });
  }

  async status(code: string, boost: number): Promise<WaitlistStatus | null> {
    const rows = await this.load();
    const me = rows.find((r) => r.code === code);
    return me ? this.statusOf(rows, me, boost) : null;
  }

  async stats(pageSlug: string): Promise<WaitlistStats> {
    const rows = (await this.load()).filter((r) => r.pageSlug === pageSlug);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
    return {
      total: rows.length,
      last7: rows.filter((r) => Date.parse(r.createdAt) > weekAgo).length,
      bySource: [...counts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    };
  }
}
