import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Footer, Header } from '@/components/chrome';
import { Share } from '@/components/share';
import { site } from '@/lib/site';
import { getWaitlistStore } from '@/lib/waitlist';
import { isReferralCode } from '@/lib/waitlist/guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'You’re on the list', robots: { index: false } };

export default async function Status({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isReferralCode(code)) notFound();
  const status = await getWaitlistStore().status(code, site.referralBoost);
  if (!status) notFound();

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const origin = process.env.NEXT_PUBLIC_SITE_URL || !host ? site.url : `${h.get('x-forwarded-proto') ?? 'https'}://${host}`;
  const link = `${origin}/?ref=${status.code}`;
  return (
    <>
      <Header />
      <main className="wrap status">
        <span className="pill"><span className="dot" />You&apos;re on the list</span>
        <div className="place" aria-label={`Position ${status.position}`}>#{status.position}</div>
        <p className="of">of {status.total.toLocaleString('en-US')} · {status.referrals} referral{status.referrals === 1 ? '' : 's'}</p>
        <h1 className="h2" style={{ margin: '40px auto 0', maxWidth: '18ch' }}>
          Skip the line.<span className="second">Each friend moves you up {site.referralBoost}.</span>
        </h1>
        <Share link={link} />
        <p className="join-meta mono" style={{ marginTop: 24 }}>Bookmark this page to check your spot</p>
      </main>
      <Footer />
    </>
  );
}
