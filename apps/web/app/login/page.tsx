import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/app/auth-shell';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Log in', robots: { index: false } };

const NOTICE: Record<string, { text: string; ok?: boolean }> = {
  link: { text: 'That link expired or was already used. Try again.' },
  confirmed: { text: 'Email confirmed. Log in to continue.', ok: true },
  reset: { text: 'Password updated. Log in with your new password.', ok: true },
};

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; notice?: string }> }) {
  const { next, error, notice } = await searchParams;
  const n = NOTICE[error ?? notice ?? ''];
  const safeNext = next?.startsWith('/app') ? next : '/app';
  return (
    <AuthShell title="Log in to ShipItLoud"
      foot={<>New here? <Link href={`/signup${next ? `?next=${encodeURIComponent(safeNext)}` : ''}`}>Create an account</Link></>}>
      {n && <p className={n.ok ? 'pr-ok' : 'pr-error'} role="status" style={{ marginTop: 0 }}>{n.text}</p>}
      <LoginForm next={safeNext} />
    </AuthShell>
  );
}
