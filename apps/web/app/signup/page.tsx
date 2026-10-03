import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/app/auth-shell';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Create your account', robots: { index: false } };

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell title="Create your account" sub="Your growth plan is about 10 minutes away."
      foot={<>Already have an account? <Link href="/login">Log in</Link></>}>
      <SignupForm next={next?.startsWith('/app') ? next : '/app/new'} />
    </AuthShell>
  );
}
