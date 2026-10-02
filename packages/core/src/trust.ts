// Trust mode (PRD section 4). Pure rules: given an asset and the workspace settings, decide
// whether it may skip the founder. Ad budget caps and the kill switch are enforced separately
// by the actions service and apply in every mode.
import type { TrustMode } from '@shipitloud/db';

export type AssetType = 'poster' | 'video' | 'post' | 'article' | 'email' | 'ad_creative' | 'reply';

export interface TrustInput {
  type: AssetType;
  platform: string | null;
  confidence: number | null;
  flags: string[];
  /** Scheduled own-channel content (not a public reply to someone else). */
  scheduled?: boolean;
  /** Matches an approved template/topic for this workspace. */
  matchesApprovedTopic?: boolean;
}

export interface TrustSettings {
  trust_mode: TrustMode;
  trust_threshold: number;
  kill_switch: boolean;
}

export type TrustDecision =
  | { auto: true; reason: string }
  | { auto: false; reason: string };

// Replies auto-approve only in Full trust, and only where ban risk is low.
const LOW_BAN_RISK_REPLY_PLATFORMS = new Set(['bluesky', 'hn', 'indiehackers', 'github']);
// Never auto-approved in any mode.
const ALWAYS_MANUAL: AssetType[] = ['ad_creative', 'article'];

export function decideTrust(asset: TrustInput, ws: TrustSettings): TrustDecision {
  if (ws.kill_switch) return { auto: false, reason: 'Kill switch is on' };
  if (ws.trust_mode === 'manual') return { auto: false, reason: 'Manual mode' };
  if (ALWAYS_MANUAL.includes(asset.type)) return { auto: false, reason: asset.type === 'article' ? 'Articles always need you' : 'Ads always need you' };
  if (asset.flags.length) return { auto: false, reason: `Flagged: ${asset.flags.join(', ')}` };
  if (asset.confidence == null) return { auto: false, reason: 'No confidence score yet' };
  if (asset.confidence < ws.trust_threshold) return { auto: false, reason: `Confidence ${asset.confidence} is below ${ws.trust_threshold}` };

  if (asset.type === 'reply') {
    if (ws.trust_mode !== 'full') return { auto: false, reason: 'Replies to other people need you' };
    if (!asset.platform || !LOW_BAN_RISK_REPLY_PLATFORMS.has(asset.platform)) {
      return { auto: false, reason: `Replies on ${asset.platform ?? 'this platform'} always need you` };
    }
    return { auto: true, reason: 'Full trust: routine reply above threshold' };
  }

  // posts, posters, emails, videos, articles
  if (!asset.scheduled) return { auto: false, reason: 'Only scheduled own-channel content auto-approves' };
  if (!asset.matchesApprovedTopic) return { auto: false, reason: 'New topic or template: needs you once' };
  return { auto: true, reason: 'Trust mode: passed QA above threshold' };
}

/** Undo window before an auto-approved item actually goes out, where the platform allows it. */
export const UNDO_WINDOW_MINUTES = 15;
