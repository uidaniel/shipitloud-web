'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { MIN_PASSWORD, PasswordInput, authError } from '@/components/app/auth';

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) { setError(`Use at least ${MIN_PASSWORD} characters.`); return; }
    if (password !== confirm) { setError('The two passwords don’t match.'); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password, data: { has_password: true } });
    if (error) { setError(authError(error.message)); setBusy(false); return; }
    // The recovery session is still valid, so go straight in.
    router.replace('/app?notice=password');
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <label className="pr-label" htmlFor="password">New password</label>
      <PasswordInput id="password" name="password" autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD} characters`} value={password} onChange={setPassword} autoFocus />
      <label className="pr-label" htmlFor="confirm">Type it again</label>
      <PasswordInput id="confirm" name="confirm" autoComplete="new-password" value={confirm} onChange={setConfirm} />
      <button className="pr-btn pr-btn-primary pr-btn-lg" disabled={busy} aria-busy={busy || undefined}>
        {busy && <span className="spin" />}{busy ? 'Saving…' : 'Save new password'}
      </button>
      {error && <p className="pr-error" role="alert">{error}</p>}
    </form>
  );
}
