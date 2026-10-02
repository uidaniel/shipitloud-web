import type { Metadata } from 'next';
import { requireWorkspace } from '@/lib/supabase/server';
import { AutomationForm, KillSwitch, NotificationsForm, ProductForm } from './forms';

export const metadata: Metadata = { title: 'Settings' };

export default async function Settings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, user, ws } = await requireWorkspace(id);
  const { data: profile } = await sb.from('profiles').select('notification_prefs').eq('id', user.id).maybeSingle();
  const prefs = (profile?.notification_prefs ?? {}) as { email?: boolean; slack?: boolean; slack_webhook?: string };

  return (
    <div className="pr-body" style={{ maxWidth: 820 }}>
      <AutomationForm ws={id} mode={ws.trust_mode} threshold={ws.trust_threshold} dropped={ws.trust_dropped_reason} />
      <KillSwitch ws={id} on={ws.kill_switch} />
      <ProductForm ws={id} name={ws.product_name} url={ws.url ?? ''} launchDate={ws.launch_date ?? ''} />
      <NotificationsForm email={prefs.email !== false} slack={!!prefs.slack} webhook={prefs.slack_webhook ?? ''} address={user.email ?? ''} />
    </div>
  );
}
