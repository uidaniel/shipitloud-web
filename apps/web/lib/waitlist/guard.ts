import { createHash, randomBytes } from 'node:crypto';

// Fraud and input checks for public signups.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Small built-in list; the common throwaway providers account for most fake signups.
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'getnada.com', 'trashmail.com',
  'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com',
  'tempail.com', 'burnermail.io', 'moakt.com', 'spamgourmet.com', 'mailnesia.com', 'tempr.email',
]);

const GMAIL = new Set(['gmail.com', 'googlemail.com']);

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** Lowercase, strip +tags, and collapse Gmail dots so one inbox = one signup. */
export function normalizeEmail(email: string): string {
  const [rawLocal = '', rawDomain = ''] = email.trim().toLowerCase().split('@');
  let local = rawLocal.split('+')[0] ?? '';
  let domain = rawDomain;
  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

export function isDisposable(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return DISPOSABLE.has(domain);
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? 'dev-salt';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeReferralCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export function isReferralCode(code: unknown): code is string {
  return typeof code === 'string' && /^[a-z2-9]{6,16}$/.test(code);
}

/** Accept only http(s) URLs or bare domains; returns a normalized URL or null. */
export function normalizeProductUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 500) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Per-instance sliding window. Good enough for Day 0; move to Postgres or KV when traffic grows.
const hits = new Map<string, number[]>();

export function rateLimited(key: string, limit = 5, windowMs = 60 * 60 * 1000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

const SOURCE_RE = /^[a-z0-9_.-]{1,40}$/;

/** Where a signup came from: referral beats utm_source beats referrer host. */
export function resolveSource(input: { ref?: string | null; utmSource?: string | null; referrerHost?: string | null }): string {
  if (input.ref) return 'referral';
  const utm = input.utmSource?.trim().toLowerCase();
  if (utm && SOURCE_RE.test(utm)) return utm;
  const host = input.referrerHost?.trim().toLowerCase().replace(/^www\./, '');
  if (host && SOURCE_RE.test(host)) return host;
  return 'direct';
}
