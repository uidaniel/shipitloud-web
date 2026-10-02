import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getPublicPage } from '@/lib/pages';
import { site } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getWaitlistStore } from '@/lib/waitlist';
import { isReferralCode } from '@/lib/waitlist/guard';
import { PageShell } from '../../../shell';
import { ShareLink } from './share';
import '../../../pages.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'You’re on the list', robots: { index: false } };

export default async function Status({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const page = await getPublicPage(slug);
  if (!page?.published || !isReferralCode(code)) notFound();
  // The code must belong to this page.
  const { data: row } = await supabaseAdmin().from('waitlist_signups').select('page_id').eq('referral_code', code).maybeSingle();
  if (row?.page_id !== page.id) notFound();
  const status = await getWaitlistStore().status(code, site.referralBoost);
  if (!status) notFound();

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const origin = host ? `${h.get('x-forwarded-proto') ?? 'https'}://${host}` : site.url;
  const link = `${origin}/p/${slug}?ref=${status.code}`;

  return (
    <PageShell page={page}>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 15 }}>You&apos;re on the list</p>
      <p className="wp-place">#{status.position}</p>
      <p className="wp-of">of {status.total.toLocaleString('en-US')} · {status.referrals} referral{status.referrals === 1 ? '' : 's'}</p>
      <h1 style={{ fontSize: 'clamp(26px, 6vw, 34px)', marginTop: 32 }}>Skip the line: each friend who joins moves you up {site.referralBoost} places.</h1>
      <ShareLink link={link} name={page.name} />
    </PageShell>
  );
}
