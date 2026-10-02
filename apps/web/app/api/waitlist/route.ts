import { NextResponse, type NextRequest } from 'next/server';
import { site } from '@/lib/site';
import { getWaitlistStore } from '@/lib/waitlist';
import { consentFor, getPublicPage, isSlug } from '@/lib/pages';
import {
  hashIp,
  isDisposable,
  isReferralCode,
  isValidEmail,
  makeReferralCode,
  normalizeEmail,
  normalizeProductUrl,
  rateLimited,
  resolveSource,
} from '@/lib/waitlist/guard';

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad('Invalid request.');
  }

  // Honeypot: real people never see this field.
  if (str(body.company)) return NextResponse.json({ ok: true });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  const ipHash = hashIp(ip ?? null);
  if (rateLimited(ipHash ?? 'unknown')) return bad('Too many signups from this network. Try again later.', 429);

  const email = str(body.email, 254)?.toLowerCase();
  if (!email || !isValidEmail(email)) return bad('Enter a valid email.');
  if (isDisposable(email)) return bad('Please use a permanent email address.');
  if (body.consent !== true) return bad('Tick the box so we can email you at launch.');

  // Which waitlist: ShipItLoud's own, or a founder's hosted page (must be published).
  let pageSlug: string = site.waitlistSlug;
  let consentText: string = site.consentText;
  if (isSlug(body.page) && body.page !== site.waitlistSlug) {
    const page = await getPublicPage(body.page);
    if (!page || !page.published) return bad('This waitlist isn’t open.', 404);
    pageSlug = page.slug;
    consentText = consentFor(page.name);
  }

  const ref = isReferralCode(body.ref) ? body.ref : null;
  let referrerHost: string | null = null;
  const referrer = str(body.referrer, 500);
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host !== new URL(site.url).hostname) referrerHost = host;
    } catch {}
  }

  try {
    const result = await getWaitlistStore().join({
      pageSlug,
      email,
      emailNormalized: normalizeEmail(email),
      consent: true,
      consentText,
      code: makeReferralCode(),
      refCode: ref,
      productUrl: normalizeProductUrl(body.productUrl),
      source: resolveSource({ ref, utmSource: str(body.utmSource, 40), referrerHost }),
      campaign: str(body.utmCampaign, 80),
      ipHash,
      boost: site.referralBoost,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[waitlist] join failed', err);
    return bad('Something broke on our side. Please try again.', 500);
  }
}
