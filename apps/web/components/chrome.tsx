import Link from 'next/link';
import { site } from '@/lib/site';
import { Wordmark } from './logo';

export function Header() {
  return (
    <header className="header">
      <div className="wrap">
        <Link href="/" aria-label={`${site.name} home`}>
          <Wordmark />
        </Link>
        <nav className="nav" aria-label="Main">
          <Link className="link" href="/#how">How it works</Link>
          <Link className="link" href="/#kit">Examples</Link>
          <Link className="link" href="/pricing">Pricing</Link>
          <Link className="btn btn-primary btn-sm" href={site.launch.live ? '/signup?next=%2Fapp%2Fnew' : '/#join'}>{site.launch.live ? 'Start free' : 'Get notified'}</Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <span>
          © {new Date().getFullYear()} {site.legalEntity}. {site.tagline}
        </span>
        <nav aria-label="Legal">
          <Link href="/pricing">Pricing</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refund">Refunds</Link>
          <a href={`mailto:${site.contactEmail}`}>Contact</a>
        </nav>
      </div>
    </footer>
  );
}
