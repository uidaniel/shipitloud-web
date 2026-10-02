'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export const MIN_PASSWORD = 8;

/** Supabase messages, in plain words. */
export function authError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('email not confirmed')) return 'Confirm your email first. Check your inbox for the link.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Too many tries. Wait a minute and try again.';
  if (m.includes('pwned') || m.includes('breach') || m.includes('weak')) return 'That password has shown up in a data breach. Pick another one.';
  if (m.includes('should be at least')) return `Use at least ${MIN_PASSWORD} characters.`;
  if (m.includes('same') && m.includes('password')) return 'That’s your current password. Pick a new one.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'Google sign-in isn’t switched on yet. Use your email for now.';
  if (m.includes('fetch') || m.includes('network')) return 'Couldn’t reach the server. Check your connection.';
  return 'Something went wrong. Try again.';
}

export function callbackUrl(next: string) {
  const u = new URL('/auth/callback', window.location.origin);
  u.searchParams.set('next', next);
  return u.toString();
}

export function PasswordInput({ id, name, autoComplete, placeholder, value, onChange, autoFocus }: {
  id: string; name: string; autoComplete: 'current-password' | 'new-password'; placeholder?: string; value: string; onChange: (v: string) => void; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pr-pass">
      <input id={id} name={name} className="pr-input" type={show ? 'text' : 'password'} autoComplete={autoComplete} required
        placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
      <button type="button" className="pr-pass-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

/** Shown only once Google sign-in is configured (NEXT_PUBLIC_AUTH_GOOGLE=1). */
export function GoogleButton({ next, label = 'Continue with Google' }: { next: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (process.env.NEXT_PUBLIC_AUTH_GOOGLE !== '1') return null;
  return (
    <>
      <button type="button" className="pr-btn pr-btn-lg pr-btn-google" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl(next) } });
        if (error) { setError(authError(error.message)); setBusy(false); }
      }}>
        {busy ? <span className="spin" /> : (
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" /></svg>
        )}
        {label}
      </button>
      {error && <p className="pr-error" role="alert">{error}</p>}
      <div className="pr-or"><span>or</span></div>
    </>
  );
}
