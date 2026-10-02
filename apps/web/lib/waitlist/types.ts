export interface JoinInput {
  pageSlug: string;
  email: string;
  emailNormalized: string;
  consent: boolean;
  consentText: string;
  code: string;
  refCode: string | null;
  productUrl: string | null;
  source: string;
  campaign: string | null;
  ipHash: string | null;
  boost: number;
}

export interface WaitlistStatus {
  code: string;
  position: number;
  referrals: number;
  total: number;
}

export interface JoinResult extends WaitlistStatus {
  existing: boolean;
}

export interface WaitlistStats {
  total: number;
  last7: number;
  bySource: { source: string; count: number }[];
}

/** Every backend (Supabase, local file) implements this, so the site works before accounts exist. */
export interface WaitlistStore {
  join(input: JoinInput): Promise<JoinResult>;
  status(code: string, boost: number): Promise<WaitlistStatus | null>;
  stats(pageSlug: string): Promise<WaitlistStats>;
}
