// Row types mirroring packages/db/migrations. Keep in sync with the SQL.

export type Plan = 'free' | 'launch_pass' | 'grow' | 'scale';
export type Stage = 'launch' | 'grow';
export type TrustMode = 'manual' | 'trust' | 'full';

export interface Workspace {
  id: string;
  owner_id: string | null;
  product_name: string;
  url: string | null;
  plan: Plan;
  stage: Stage;
  trust_mode: TrustMode;
  created_at: string;
}

export interface WaitlistPage {
  id: string;
  workspace_id: string;
  slug: string;
  custom_domain: string | null;
  template_id: string | null;
  next_position: number;
  published_at: string | null;
  created_at: string;
}

export interface WaitlistSignup {
  id: string;
  workspace_id: string;
  page_id: string;
  email: string;
  email_normalized: string;
  consent: boolean;
  consent_text: string;
  referral_code: string;
  referrer_id: string | null;
  referral_count: number;
  /** Base position at signup. The effective rank is computed from referrals. */
  position: number;
  product_url: string | null;
  source: string;
  campaign: string | null;
  ip_hash: string | null;
  flagged: boolean;
  created_at: string;
}

export interface SignupEvent {
  id: string;
  workspace_id: string;
  signup_id: string | null;
  source: string;
  campaign: string | null;
  link_id: string | null;
  consent: boolean;
  created_at: string;
}
