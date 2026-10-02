import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { JoinInput, JoinResult, WaitlistStats, WaitlistStatus, WaitlistStore } from './types.ts';

// Calls the SQL functions in packages/db/migrations/0001_waitlist.sql with the service role key.
export class SupabaseWaitlistStore implements WaitlistStore {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async join(i: JoinInput): Promise<JoinResult> {
    const { data, error } = await this.db.rpc('waitlist_join', {
      p_page_slug: i.pageSlug,
      p_email: i.email,
      p_email_normalized: i.emailNormalized,
      p_consent: i.consent,
      p_consent_text: i.consentText,
      p_code: i.code,
      p_ref_code: i.refCode,
      p_product_url: i.productUrl,
      p_source: i.source,
      p_campaign: i.campaign,
      p_ip_hash: i.ipHash,
      p_boost: i.boost,
    });
    if (error) throw new Error(`waitlist_join failed: ${error.message}`);
    return data as JoinResult;
  }

  async status(code: string, boost: number): Promise<WaitlistStatus | null> {
    const { data, error } = await this.db.rpc('waitlist_status', { p_code: code, p_boost: boost });
    if (error) throw new Error(`waitlist_status failed: ${error.message}`);
    return (data as WaitlistStatus | null) ?? null;
  }

  async stats(pageSlug: string): Promise<WaitlistStats> {
    const { data, error } = await this.db.rpc('waitlist_stats', { p_page_slug: pageSlug });
    if (error) throw new Error(`waitlist_stats failed: ${error.message}`);
    return data as WaitlistStats;
  }
}
