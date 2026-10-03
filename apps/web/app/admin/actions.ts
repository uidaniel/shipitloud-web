'use server';

import { revalidatePath } from 'next/cache';
import { audit, requireAdmin } from '@/lib/admin';

/** Suspend a workspace: the kill switch goes on (nothing posts, sends or spends) and the owner sees why. */
export async function setSuspended(form: FormData) {
  const { user, admin } = await requireAdmin();
  const id = String(form.get('id') ?? '');
  const on = form.get('on') === 'true';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await admin.from('workspaces').update(on
    ? { suspended_at: new Date().toISOString(), suspended_reason: 'Paused by ShipItLoud while we review unusual activity.', kill_switch: true }
    : { suspended_at: null, suspended_reason: null }).eq('id', id);
  await audit(user.id, on ? 'workspace.suspended' : 'workspace.unsuspended', id);
  revalidatePath('/admin');
}
