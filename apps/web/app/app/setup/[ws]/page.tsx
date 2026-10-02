import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { LogoIcon } from '@/components/logo';
import { BrandEditor } from '@/components/app/brand-editor';
import { BuildingBrand } from '@/components/app/build-status';
import { DescribeForm } from './describe';

export const metadata: Metadata = { title: 'Set up your brand' };

export default async function Setup({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, ws } = await requireWorkspace(id);
  const [{ data: brain }, { data: voice }] = await Promise.all([
    sb.from('brand_brains').select('*').eq('workspace_id', id).maybeSingle(),
    sb.from('voice_profiles').select('tone').eq('workspace_id', id).maybeSingle(),
  ]);
  const status = brain?.status ?? 'idle';

  return (
    <div className="pr-onb" style={{ alignItems: 'start', paddingTop: 'clamp(32px, 8vh, 80px)' }}>
      <div className="pr-onb-card" style={{ maxWidth: status === 'ready' ? 760 : 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <LogoIcon size={34} />
          <Link href={`/app/${id}/inbox`} className="pr-btn pr-btn-ghost pr-btn-sm">Skip for now</Link>
        </div>
        <div className="pr-steps" aria-label="Step 2 of 3"><i className="on" /><i className="on" /><i /></div>

        {status === 'building' && (
          <>
            <h1>Getting to know {ws.product_name}</h1>
            <p className="sub">We&apos;re reading your site to learn who it&apos;s for and how you sound.</p>
            <BuildingBrand site={ws.url} />
          </>
        )}

        {status === 'ready' && brain && (
          <>
            <h1>{brain.one_liner ?? ws.product_name}</h1>
            <p className="sub">{brain.summary}</p>
            <BrandEditor ws={id} onboarding brand={{ ...brain, tone: voice?.tone ?? null }} />
          </>
        )}

        {(status === 'idle' || status === 'failed') && (
          <>
            <h1>Tell us about {ws.product_name}</h1>
            <p className="sub">
              {status === 'failed' ? brain?.error ?? 'We couldn’t read your site.' : 'No site yet? Describe it in a few sentences and we’ll take it from there.'}
            </p>
            <DescribeForm ws={id} initial={brain?.description ?? ''} />
          </>
        )}
      </div>
    </div>
  );
}
