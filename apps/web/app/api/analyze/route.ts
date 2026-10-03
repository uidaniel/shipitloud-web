import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hashIp, isDisposable, isValidEmail, normalizeEmail, normalizeProductUrl, rateLimited } from '@/lib/waitlist/guard';

// The free mini analysis (PRD section 23 lead magnet): email first, then summary, positioning, top 3 page fixes and
// recommended channels. One per email and one per domain; rate-limited by network. Uses the cheap model only.
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const FITS = new Set(['launching_soon', 'already_live', 'exploring']);

// Store and app pages are shared hosts: the "domain" there is the app's own path.
function domainOf(url: string) {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  if (/^(apps\.apple\.com|play\.google\.com|github\.com)$/.test(host)) return `${host}${u.pathname.replace(/\/$/, '')}${u.searchParams.get('id') ? `?id=${u.searchParams.get('id')}` : ''}`.toLowerCase();
  return host;
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return bad('Invalid request.'); }
  if (typeof b.company === 'string' && b.company) return NextResponse.json({ id: null });   // honeypot
  const url = normalizeProductUrl(b.url);
  if (!url) return bad('Paste your product’s link, like yourproduct.com');
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 254) : '';
  if (!isValidEmail(email)) return bad('Enter a valid email.');
  if (isDisposable(email)) return bad('Please use a permanent email address.');
  const fit = typeof b.fit === 'string' && FITS.has(b.fit) ? b.fit : null;
  if (!fit) return bad('Pick the one that fits you.');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  const ipHash = hashIp(ip ?? null);
  if (rateLimited(`analyze:${ipHash ?? 'unknown'}`, 3, 60 * 60_000)) return bad('Too many analyses from this network. Try again in an hour.', 429);

  const db = supabaseAdmin();
  const domain = domainOf(url);
  const emailNormalized = normalizeEmail(email);
  const { data: seen } = await db.from('free_analyses').select('id, email_normalized, domain').or(`email_normalized.eq.${emailNormalized},domain.eq.${domain}`).limit(2);
  const same = seen?.find((r) => r.email_normalized === emailNormalized && r.domain === domain);
  if (same) return NextResponse.json({ id: same.id });   // the same person and site: show their analysis again
  if (seen?.some((r) => r.domain === domain)) return bad('This site already has a free analysis. Start free to get the full plan.', 409);
  if (seen?.length) return bad('You’ve already used your free analysis. Start free to analyse another product.', 409);

  const { data, error } = await db.from('free_analyses').insert({ email, email_normalized: emailNormalized, url, domain, fit, consent: b.consent === true, ip_hash: ipHash }).select('id').single();
  if (error || !data) return bad(error?.code === '23505' ? 'This site already has a free analysis. Start free to get the full plan.' : 'Something went wrong. Try again.', error?.code === '23505' ? 409 : 500);
  await db.rpc('enqueue_job', { p_workspace: null, p_type: 'free.analysis', p_payload: { id: data.id }, p_run_at: new Date().toISOString(), p_key: `free:${data.id}` });
  return NextResponse.json({ id: data.id });
}
