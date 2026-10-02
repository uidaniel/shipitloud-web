import Link from 'next/link';
import { site } from '@/lib/site';
import { SiteNav } from './space/site-nav';
import '../app/space.css';

export const LEGAL_UPDATED = '2 October 2026';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space">
      <div className="space-bg" aria-hidden="true" />
      <SiteNav onHome={false} />
      <main className="sp-wrap doc legal">
        <h1>{title}</h1>
        <p className="updated">Last updated {LEGAL_UPDATED}</p>
        {children}
      </main>
      <footer className="sp-footer">
        <div className="sp-wrap sp-footer-in">
          <span>© {new Date().getFullYear()} {site.legalEntity}. {site.tagline}</span>
          <nav aria-label="Legal">
            <Link href="/pricing">Pricing</Link>
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
