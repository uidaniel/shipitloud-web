import { requireWorkspace } from '@/lib/supabase/server';
import { Sidebar } from './sidebar';

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, user, ws } = await requireWorkspace(id);
  const period = new Date().toISOString().slice(0, 7) + '-01';

  const [pending, usage, limits, notes] = await Promise.all([
    sb.from('assets').select('id', { count: 'exact', head: true }).eq('workspace_id', id).eq('status', 'pending'),
    sb.from('usage').select('videos, images, ai_drafts').eq('workspace_id', id).eq('period', period).maybeSingle(),
    sb.from('plan_limits').select('metric, monthly_cap').eq('plan', ws.plan),
    sb.from('notifications').select('id, title, body, url, read_at, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(15),
  ]);

  const cap = (m: string) => limits.data?.find((l) => l.metric === m)?.monthly_cap ?? null;
  const meter = (['ai_drafts', 'images', 'videos'] as const).map((m) => ({
    label: m === 'ai_drafts' ? 'AI drafts' : m === 'images' ? 'Images' : 'Videos',
    used: (usage.data as Record<string, number> | null)?.[m] ?? 0,
    cap: cap(m),
  }));

  return (
    <div className="pr-shell">
      <Sidebar
        ws={{ id, name: ws.product_name, plan: ws.plan }}
        pending={pending.count ?? 0}
        meter={meter}
        email={user.email ?? ''}
        notifications={notes.data ?? []}
      >
        {children}
      </Sidebar>
    </div>
  );
}
