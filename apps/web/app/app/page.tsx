import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/supabase/server';

export default async function AppHome() {
  const { sb } = await requireUser();
  const { data } = await sb.from('workspaces').select('id').order('created_at').limit(1);
  redirect(data?.[0] ? `/app/${data[0].id}` : '/app/new');
}
