import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoIcon } from '@/components/logo';
import { Comets } from '@/components/space/comets';
import { Globe } from '@/components/space/globe';
import '@/app/product.css';

/**
 * Shared frame for login, sign up, forgot and reset password: deep space with twinkling stars, a moon and a slow
 * orbit, and the landing page's spinning globe rising at the bottom. The form sits centered on top.
 */
export function AuthShell({ title, sub, children, foot }: { title: string; sub?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="pr pr-auth cosmos">
      <div className="cosmos-sky" aria-hidden="true"><i className="s1" /><i className="s2" /><i className="s3" /></div>
      <div className="cosmos-orbit" aria-hidden="true"><span /></div>
      <div className="cosmos-moon" aria-hidden="true" />
      <Comets />
      <div className="cosmos-globe" aria-hidden="true"><Globe /></div>
      <Link href="/" className="cosmos-home"><span aria-hidden="true">←</span> Home</Link>
      <main className="pr-auth-card">
        <Link href="/" className="cosmos-mark" aria-label="ShipItLoud home"><LogoIcon size={34} /></Link>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
        {foot && <p className="pr-auth-foot">{foot}</p>}
        <div className="cosmos-form">{children}</div>
        <p className="legal">
          By continuing you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}
