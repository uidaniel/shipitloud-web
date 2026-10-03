import { requireAdmin } from '@/lib/admin';
import { MfaForm } from './mfa-form';

export const dynamic = 'force-dynamic';

export default async function AdminMfa() {
  const { user } = await requireAdmin({ mfa: false });
  return (
    <div className="pr-body" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
      <MfaForm email={user.email ?? ''} />
    </div>
  );
}
