import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/space/site-nav';
import { PricingSpace } from '@/components/space/pricing-space';
import { SpaceScene } from '@/components/space/space-scene';
import { site } from '@/lib/site';
import '../space.css';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free waitlist page, a $199 Launch Pass, and Grow and Scale plans from $49 a month.',
};

export default function PricingPage() {
  return (
    <div className="space">
      <div className="space-bg" aria-hidden="true" />
      <SpaceScene />
      <SiteNav onHome={false} />
      <main id="pricing" className="sp-wrap" style={{ paddingTop: 140, paddingBottom: 120 }}>
        <PricingSpace />
      </main>
      <footer className="sp-footer">
        <div className="sp-wrap sp-footer-in">
          <span>© {new Date().getFullYear()} {site.legalEntity}. {site.tagline}</span>
          <nav aria-label="Legal">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund">Refunds</Link>
            <a href={`mailto:${site.contactEmail}`}>Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
