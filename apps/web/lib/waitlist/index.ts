import { join } from 'node:path';
import { MemoryWaitlistStore } from './memory-store.ts';
import { SupabaseWaitlistStore } from './supabase-store.ts';
import type { WaitlistStore } from './types.ts';

export type { WaitlistStats, WaitlistStatus, JoinResult } from './types.ts';

let store: WaitlistStore | undefined;

export function getWaitlistStore(): WaitlistStore {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    store = new SupabaseWaitlistStore(url, key);
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[waitlist] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; using a local file store. Signups will not persist on serverless hosts.');
    }
    store = new MemoryWaitlistStore(join(process.cwd(), '.data', 'waitlist.json'));
  }
  return store;
}
