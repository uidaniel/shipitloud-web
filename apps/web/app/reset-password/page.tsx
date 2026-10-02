import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/app/auth-shell';
import { supabaseServer } from '@/lib/supabase/server';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

// Reached from the reset email: the callback has already signed the user in with a one-time recovery session.
export default async function ResetPassword() {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) {
    return (
      <AuthShell title="Link expired" sub="Reset links work once and expire after an hour.">
        <Link className="pr-btn pr-btn-primary pr-btn-lg" href="/forgot">Send a new link</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" sub={<>For <span style={{ color: 'var(--text)' }}>{data.user.email}</span></>}>
      <ResetForm />
    </AuthShell>
  );
}
