import type { BrandContext } from '@shipitloud/ai';
import { check, type Db } from './db.ts';

/** Everything the AI needs to sound like the brand. Throws until the brand brain is ready. */
export async function brandContext(db: Db, workspaceId: string): Promise<BrandContext> {
  const ws = check(await db.from('workspaces').select('product_name, url, launch_date').eq('id', workspaceId).single(), 'ws')!;
  const [b, v] = await Promise.all([
    db.from('brand_brains').select('status, one_liner, target_customer, pain_points, competitors, keywords').eq('workspace_id', workspaceId).maybeSingle(),
    db.from('voice_profiles').select('tone, dos, donts').eq('workspace_id', workspaceId).maybeSingle(),
  ]);
  if (b.data?.status !== 'ready') throw new Error('Set up your brand first so everything sounds like you.');
  return {
    name: ws.product_name, url: ws.url, launch_date: ws.launch_date,
    one_liner: b.data.one_liner, target_customer: b.data.target_customer,
    pain_points: b.data.pain_points ?? [], competitors: b.data.competitors ?? [], keywords: b.data.keywords ?? [],
    tone: v.data?.tone ?? null, dos: v.data?.dos ?? [], donts: v.data?.donts ?? [],
  };
}
