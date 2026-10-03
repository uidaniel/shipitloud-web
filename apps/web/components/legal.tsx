import Link from 'next/link';
import { site } from '@/lib/site';
import { SiteNav } from './space/site-nav';
import '../app/space.css';

export const LEGAL_UPDATED = '2 October 2026';

export function LegalPage({ title, children, updated = true }: { title: string; children: React.ReactNode; updated?: boolean }) {
  return (
    <div className="space">
      <div className="space-bg" aria-hidden="true" />
      <SiteNav onHome={false} />
      <main className="sp-wrap doc legal">
        <h1>{title}</h1>
        {updated && <p className="updated">Last updated {LEGAL_UPDATED}</p>}
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
            <Link href="/cookies">Cookies</Link>
            <Link href="/acceptable-use">Acceptable use</Link>
            <Link href="/dpa">DPA</Link>
            <Link href="/subprocessors">Sub-processors</Link>
            <Link href="/help">Help</Link>
            <Link href="/status">Status</Link>
            <a href={`mailto:${site.contactEmail}`}>Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
