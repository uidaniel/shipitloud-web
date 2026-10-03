import type { Metadata } from 'next';
import { requireWorkspace } from '@/lib/supabase/server';
import { AccountForm, AutomationForm, DataForm, ExtensionForm, KillSwitch, NotificationsForm, ProductForm, ProfileForm } from './forms';

export const metadata: Metadata = { title: 'Settings' };

export default async function Settings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, user, ws } = await requireWorkspace(id);
  const [{ data: profile }, { data: deletion }] = await Promise.all([
    sb.from('profiles').select('name, timezone, notification_prefs').eq('id', user.id).maybeSingle(),
    sb.from('deletion_requests').select('scheduled_for').eq('workspace_id', id).is('cancelled_at', null).is('completed_at', null).maybeSingle(),
  ]);
  const { data: tokens } = await sb.from('extension_tokens').select('id, label, last_used_at, created_at').eq('workspace_id', id).is('revoked_at', null).order('created_at');
  const prefs = (profile?.notification_prefs ?? {}) as { email?: boolean; slack?: boolean; slack_webhook?: string; types?: Record<string, boolean>; quiet?: { start: number; end: number } | null };

  return (
    <div className="pr-body pr-settings">
      <div className="pr-page-h"><h1 className="pr-h1">Settings</h1><p className="pr-lead">Automation, safety and your product details.</p></div>
      <AutomationForm ws={id} mode={ws.trust_mode} threshold={ws.trust_threshold} dropped={ws.trust_dropped_reason} />
      <KillSwitch ws={id} on={ws.kill_switch} />
      <ProductForm ws={id} name={ws.product_name} url={ws.url ?? ''} launchDate={ws.launch_date ?? ''} />
      <NotificationsForm email={prefs.email !== false} slack={!!prefs.slack} webhook={prefs.slack_webhook ?? ''} address={user.email ?? ''} types={prefs.types ?? {}} quiet={prefs.quiet ?? null} timezone={profile?.timezone ?? 'UTC'} />
      <ProfileForm name={profile?.name ?? ''} />
      <ExtensionForm ws={id} tokens={tokens ?? []} />
      <AccountForm email={user.email ?? ''} hasPassword={!!user.user_metadata?.has_password} />
      <DataForm ws={id} product={ws.product_name} scheduled={deletion?.scheduled_for ?? null} />
    </div>
  );
}
