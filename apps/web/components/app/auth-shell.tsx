import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoIcon } from '@/components/logo';
import '@/app/product.css';

/** Shared frame for login, sign up, forgot and reset password. */
export function AuthShell({ title, sub, children, foot }: { title: string; sub?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="pr pr-auth">
      <div className="pr-auth-card">
        <Link href="/" className="pr-auth-brand" style={{ textDecoration: 'none' }}>
          <LogoIcon size={30} />
          <span>ShipIt<b>Loud</b></span>
        </Link>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
        {children}
        {foot && <p className="pr-auth-foot">{foot}</p>}
        <p className="legal">
          By continuing you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
