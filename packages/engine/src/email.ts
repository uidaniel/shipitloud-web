// Emails to a founder's audience: rendering (HTML + text), signed unsubscribe links, sequence timing, and sending
// through Resend with one-click unsubscribe headers (RFC 8058, required by Gmail and Yahoo for bulk senders).
import { createHmac, timingSafeEqual } from 'node:crypto';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type SequenceKind = 'welcome' | 'referral_nudge' | 'countdown' | 'launch_day';
export const SEQUENCE: SequenceKind[] = ['welcome', 'referral_nudge', 'countdown', 'launch_day'];

/** Fills {{placeholders}}; unknown ones are removed rather than sent as raw braces. */
export function fill(template: string, vars: Record<string, string | number | null | undefined>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (vars[k] == null ? '' : String(vars[k])));
}

export interface AudienceEmail {
  subject: string;
  body: string;                                   // plain text, paragraphs separated by blank lines
  brand: { name: string; accent: string; onAccent: string };
  cta?: { label: string; url: string } | null;
  footer: { address: string; unsubscribeUrl: string; reason: string };
}

/** HTML (inline styles, works in every client) and a plain-text part. URLs in the body become links. */
export function renderEmail(e: AudienceEmail): { html: string; text: string } {
  const paras = e.body.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const linkify = (s: string) => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,!?;:)])/g, `<a href="$1" style="color:${esc(e.brand.accent)}">$1</a>`).replace(/\n/g, '<br>');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f2">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#16161d">
<div style="font-weight:700;font-size:15px;margin-bottom:20px">${esc(e.brand.name)}</div>
${paras.map((p) => `<p style="margin:0 0 16px">${linkify(p)}</p>`).join('\n')}
${e.cta ? `<p style="margin:24px 0"><a href="${esc(e.cta.url)}" style="display:inline-block;background:${esc(e.brand.accent)};color:${esc(e.brand.onAccent)};padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(e.cta.label)}</a></p>` : ''}
<hr style="border:0;border-top:1px solid #e3e3df;margin:28px 0 16px">
<p style="margin:0;font-size:12px;line-height:1.5;color:#7a7a85">${esc(e.footer.reason)}<br>${esc(e.footer.address)}<br><a href="${esc(e.footer.unsubscribeUrl)}" style="color:#7a7a85">Unsubscribe</a></p>
</div></body></html>`;
  const text = [`${e.brand.name}`, '', ...paras.flatMap((p) => [p, '']), ...(e.cta ? [`${e.cta.label}: ${e.cta.url}`, ''] : []), '--', e.footer.reason, e.footer.address, `Unsubscribe: ${e.footer.unsubscribeUrl}`].join('\n');
  return { html, text };
}

// ---------------------------------------------------------------- unsubscribe tokens
function secret() {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.TOKEN_ENCRYPTION_KEY || process.env.IP_HASH_SALT;
  if (!s) throw new Error('Set UNSUBSCRIBE_SECRET (or TOKEN_ENCRYPTION_KEY) to sign unsubscribe links');
  return s;
}
const sign = (id: string) => createHmac('sha256', secret()).update(`unsub:${id}`).digest('base64url').slice(0, 22);
export const unsubscribeToken = (signupId: string) => `${Buffer.from(signupId).toString('base64url')}.${sign(signupId)}`;
/** The signup id when the token is genuine, else null. */
export function readUnsubscribeToken(token: string): string | null {
  const [a, b] = token.split('.');
  if (!a || !b) return null;
  let id: string;
  try { id = Buffer.from(a, 'base64url').toString('utf8'); } catch { return null; }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const want = sign(id);
  return b.length === want.length && timingSafeEqual(Buffer.from(b), Buffer.from(want)) ? id : null;
}

// ---------------------------------------------------------------- sequence timing
export interface SignupState { created_at: string; referral_count: number; unsubscribed_at: string | null }

/** Which sequence emails a signup should get now. Dates are UTC days; each kind is sent once. */
export function dueKinds(s: SignupState, o: { now: Date; launchDate: string | null; sent: Set<string>; active: Set<string> }): SequenceKind[] {
  if (s.unsubscribed_at) return [];
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const today = day(o.now);
  const ageH = (o.now.getTime() - Date.parse(s.created_at)) / 3_600_000;
  const out: SequenceKind[] = [];
  const can = (k: SequenceKind) => o.active.has(k) && !o.sent.has(k);
  const launch = o.launchDate;
  const beforeLaunch = !launch || today < launch;
  if (can('welcome') && ageH < 7 * 24) out.push('welcome');
  if (can('referral_nudge') && o.sent.has('welcome') && ageH >= 48 && s.referral_count === 0 && beforeLaunch) out.push('referral_nudge');
  if (launch && can('countdown')) {
    const eve = day(new Date(Date.parse(`${launch}T00:00:00Z`) - 86_400_000));
    if (today === eve && day(new Date(s.created_at)) < today) out.push('countdown');
  }
  if (launch && can('launch_day') && today >= launch && today <= day(new Date(Date.parse(`${launch}T00:00:00Z`) + 86_400_000))) out.push('launch_day');
  // Never two emails on the same run: the most time-sensitive one wins, the rest wait for the next run.
  return out.length > 1 ? [out.includes('launch_day') ? 'launch_day' : out.includes('countdown') ? 'countdown' : out[0]!] : out;
}

// ---------------------------------------------------------------- sending
export interface SendResult { id: string; simulated: boolean }

/**
 * Sends one email through Resend. Outside live mode (ACTIONS_MODE !== 'live') or without a key, nothing leaves:
 * it's logged and reported as simulated.
 */
export async function sendEmail(m: { from: string; replyTo?: string | null; to: string; subject: string; html: string; text: string; unsubscribeUrl: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key || process.env.ACTIONS_MODE !== 'live') {
    console.log(`[email:${key ? 'test' : 'dev'}] to=${m.to.replace(/(.).+(@.+)/, '$1…$2')} :: ${m.subject}`);
    return { id: `sim_${Date.now().toString(36)}`, simulated: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: m.from, to: m.to, subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      headers: { 'List-Unsubscribe': `<${m.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { id: ((await res.json()) as { id: string }).id, simulated: false };
}

/** "Balans via ShipItLoud <hello@…>" until the founder verifies their own sending domain. */
export function fromAddress(o: { fromName: string; product: string; domain?: string | null; verified?: boolean }) {
  const name = (o.fromName || o.product).replace(/[<>"]/g, '').slice(0, 60);
  if (o.domain && o.verified) return `${name} <hello@${o.domain}>`;
  const base = (process.env.EMAIL_FROM ?? 'ShipItLoud <onboarding@resend.dev>').match(/<([^>]+)>/)?.[1] ?? 'onboarding@resend.dev';
  return `${name} via ShipItLoud <${base}>`;
}
