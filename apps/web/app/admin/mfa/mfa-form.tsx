'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

// Two-factor for the admin area: enroll an authenticator app once, then enter its 6-digit code each session.
export function MfaForm({ email }: { email: string }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const { data } = await sb.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === 'verified');
      if (verified) { setFactorId(verified.id); return; }
      // Leftover unverified factors block a new enrollment.
      for (const f of data?.all ?? []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data: e, error: err } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `ShipItLoud admin ${Date.now().toString(36)}` });
      if (err || !e) { setError(err?.message ?? 'Couldn’t start two-factor setup.'); return; }
      setFactorId(e.id); setQr(e.totp.qr_code); setSecret(e.totp.secret);
    })();
  }, []);

  async function verify(ev: React.FormEvent) {
    ev.preventDefault();
    if (!factorId) return;
    setBusy(true); setError(null);
    const { error: err } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
    setBusy(false);
    if (err) { setError('That code didn’t work. Use the newest one from your app.'); return; }
    router.replace('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={verify} className="tc" style={{ width: 'min(420px, 100%)' }}>
      <span className="tc-test">Admin · {email}</span>
      <h1>{qr ? 'Set up two-factor' : 'Enter your code'}</h1>
      {qr && (
        <>
          <p className="pr-hint" style={{ margin: 0 }}>Scan with an authenticator app (1Password, Google Authenticator, Authy), then enter the 6-digit code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Two-factor QR code" width={180} height={180} style={{ justifySelf: 'center', background: '#fff', borderRadius: 12, padding: 8 }} />
          {secret && <code style={{ fontSize: 12, textAlign: 'center', wordBreak: 'break-all' }}>{secret}</code>}
        </>
      )}
      {!qr && <p className="pr-hint" style={{ margin: 0 }}>Open your authenticator app and enter the code for ShipItLoud.</p>}
      <input className="pr-input" inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value)} maxLength={7} autoFocus aria-label="Six-digit code" />
      {error && <p className="pr-error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <button className="pr-btn pr-btn-primary pr-btn-lg" disabled={busy || code.replace(/\s/g, '').length !== 6 || !factorId}>{busy ? 'Checking…' : 'Verify'}</button>
    </form>
  );
}
