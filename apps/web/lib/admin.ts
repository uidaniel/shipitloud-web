import { notFound, redirect } from 'next/navigation';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';

// The founder's admin area (PRD section 25): only emails in ADMIN_EMAILS, and only with two-factor (TOTP) verified
// in this session. Anyone else gets a 404, so the area isn't advertised.
export const adminEmails = () => (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function requireAdmin(o: { mfa?: boolean } = { mfa: true }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email || !adminEmails().includes(user.email.toLowerCase())) notFound();
  if (o.mfa !== false) {
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel !== 'aal2') redirect('/admin/mfa');
  }
  return { sb, user, admin: supabaseAdmin() };
}

export async function audit(adminId: string, action: string, target: string, detail: Record<string, unknown> = {}) {
  await supabaseAdmin().from('admin_audit_log').insert({ admin_id: adminId, action, target, detail });
}
