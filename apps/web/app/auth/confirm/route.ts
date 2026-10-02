import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';

// Email links in the token-hash form (Supabase email templates using {{ .TokenHash }}).
// Unlike /auth/callback, these work even when opened in a different browser from the one that asked.
const TYPES: EmailOtpType[] = ['signup', 'recovery', 'magiclink', 'email', 'email_change', 'invite'];

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = type === 'recovery' ? '/reset-password' : safeNext(url.searchParams.get('next'));
  if (tokenHash && type && TYPES.includes(type)) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(type === 'recovery' ? '/forgot?error=link' : '/login?error=link', url.origin));
}
