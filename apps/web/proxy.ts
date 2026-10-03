import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Keeps the Supabase session fresh and bounces signed-out visitors away from /app.
// Optimistic check only; every page and action still verifies the user server-side.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await sb.auth.getUser();
  const path = request.nextUrl.pathname;
  // Referral links (/signup?ref=code): remembered for 30 days, applied when the founder creates a workspace.
  const ref = request.nextUrl.searchParams.get('ref');
  if (path === '/signup' && ref && /^[a-z0-9]{4,20}$/.test(ref)) response.cookies.set('sil_ref', ref, { maxAge: 30 * 86_400, path: '/', sameSite: 'lax', httpOnly: true });
  // Signed-in people don't need the login or sign-up pages.
  if (data.user && (path === '/login' || path === '/signup')) return NextResponse.redirect(new URL('/app', request.url));
  if (!data.user && path.startsWith('/app')) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ['/app/:path*', '/login', '/signup', '/forgot', '/reset-password', '/auth/:path*'],
};
