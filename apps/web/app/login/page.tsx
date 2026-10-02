import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoIcon } from '@/components/logo';
import { LoginForm } from './login-form';
import '../product.css';

export const metadata: Metadata = { title: 'Log in', robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="pr pr-auth">
      <div className="pr-auth-card">
        <Link href="/" className="pr-auth-brand" style={{ textDecoration: 'none' }}>
          <LogoIcon size={30} />
          <span>ShipIt<b>Loud</b></span>
        </Link>
        <h1>Log in or sign up</h1>
        <p className="sub">We&apos;ll email you a link. No password needed.</p>
        <LoginForm next={next?.startsWith('/app') ? next : '/app'} />
        {error && <p className="pr-error">That link expired or was already used. Send a new one.</p>}
        <p className="legal">
          By continuing you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
