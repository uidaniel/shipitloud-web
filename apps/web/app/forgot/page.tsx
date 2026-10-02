import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/app/auth-shell';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } };

export default async function Forgot({ searchParams }: { searchParams: Promise<{ email?: string; error?: string }> }) {
  const { email, error } = await searchParams;
  return (
    <AuthShell title="Reset your password" sub="Enter your email and we’ll send you a link to choose a new one."
      foot={<>Remembered it? <Link href="/login">Log in</Link></>}>
      {error && <p className="pr-error" role="alert" style={{ marginTop: 0 }}>That reset link expired or was already used. Send a new one.</p>}
      <ForgotForm initialEmail={email ?? ''} />
    </AuthShell>
  );
}
