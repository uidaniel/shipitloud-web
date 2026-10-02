import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Per-request client acting as the signed-in user. RLS applies. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(url(), anon(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** Server-only admin client. Bypasses RLS: only use for things a user can't do themselves. */
export function supabaseAdmin() {
  return createServiceClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** The signed-in user, or a redirect to /login. */
export async function requireUser() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect('/login');
  return { sb, user: data.user };
}

/** The workspace if the signed-in user owns it (RLS enforces this), or 404. */
export async function requireWorkspace(id: string) {
  const { sb, user } = await requireUser();
  const { data: ws } = await sb.from('workspaces').select('*').eq('id', id).maybeSingle();
  if (!ws) redirect('/app');
  return { sb, user, ws: ws as Workspace };
}

export interface Workspace {
  id: string;
  owner_id: string;
  product_name: string;
  url: string | null;
  plan: 'free' | 'launch_pass' | 'grow' | 'scale';
  stage: 'launch' | 'grow';
  trust_mode: 'manual' | 'trust' | 'full';
  trust_threshold: number;
  kill_switch: boolean;
  trust_dropped_at: string | null;
  trust_dropped_reason: string | null;
  launch_date: string | null;
  created_at: string;
}
