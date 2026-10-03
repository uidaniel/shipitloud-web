import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { BrandEditor } from '@/components/app/brand-editor';
import { BuildingBrand } from '@/components/app/build-status';
import { Submit } from '@/components/app/ui';
import { rebuildBrand } from '../../actions';

export const metadata: Metadata = { title: 'Brand' };

export default async function Brand({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, ws } = await requireWorkspace(id);
  const [{ data: brain }, { data: voice }, { data: kit }] = await Promise.all([
    sb.from('brand_brains').select('*').eq('workspace_id', id).maybeSingle(),
    sb.from('voice_profiles').select('tone, style_notes, dos, donts').eq('workspace_id', id).maybeSingle(),
    sb.from('brand_kits').select('logo_url, palette, fonts').eq('workspace_id', id).maybeSingle(),
  ]);

  if (!brain || brain.status === 'idle' || brain.status === 'failed') {
    return (
      <div className="pr-body" style={{ maxWidth: 820 }}>
        <div className="pr-page-h"><h1 className="pr-h1">Brand</h1></div>
        <div className="pr-list"><div className="pr-empty">
          <h2>{brain?.status === 'failed' ? 'We couldn’t build your brand brain' : 'No brand brain yet'}</h2>
          <p>{brain?.error ?? 'Tell us about your product so every draft sounds like you.'}</p>
          <Link className="pr-btn pr-btn-primary" href={`/app/setup/${id}`}>Set it up</Link>
        </div></div>
      </div>
    );
  }
  if (brain.status === 'building') return <div className="pr-body" style={{ maxWidth: 820 }}><BuildingBrand site={ws.url} /></div>;

  return (
    <div className="pr-body" style={{ maxWidth: 820 }}>
      <div className="pr-page-h"><h1 className="pr-h1">Brand</h1><p className="pr-lead">How {ws.product_name} looks and sounds. Every draft uses this.</p></div>
      <BrandEditor ws={id} brand={{ ...brain, tone: voice?.tone ?? null }} />

      <section className="pr-section">
        <div className="pr-section-h"><h2>Voice</h2><p>{voice?.style_notes ?? 'How your brand writes.'}</p></div>
        {(!!voice?.dos?.length || !!voice?.donts?.length) && (
          <div className="pr-section-b pr-grid-2">
            <div>
              <p className="pr-label">Do</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--muted)' }}>{voice?.dos?.map((d: string) => <li key={d}>{d}</li>)}</ul>
            </div>
            <div>
              <p className="pr-label">Don&apos;t</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--muted)' }}>{voice?.donts?.map((d: string) => <li key={d}>{d}</li>)}</ul>
            </div>
          </div>
        )}
      </section>

      <section className="pr-section">
        <div className="pr-section-h"><h2>Brand kit</h2><p>Pulled from your site. Logo and colors go onto every poster exactly as they are.</p></div>
        <div className="pr-section-b" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <p className="pr-label">Logo</p>
            {kit?.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={kit.logo_url} alt={`${ws.product_name} logo`} width={56} height={56} style={{ borderRadius: 12, background: '#fff', padding: 6, objectFit: 'contain' }} />
              : <span className="pr-hint">Not found yet</span>}
          </div>
          <div>
            <p className="pr-label">Colors</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {kit?.palette?.length ? kit.palette.map((c: string) => (
                <span key={c} title={c} style={{ width: 36, height: 36, borderRadius: 9, background: c, border: '1px solid var(--line-2)' }} />
              )) : <span className="pr-hint">Not found yet</span>}
            </div>
          </div>
          <div>
            <p className="pr-label">Fonts</p>
            <span style={{ color: 'var(--muted)' }}>{kit?.fonts?.length ? kit.fonts.join(', ') : 'Not detected'}</span>
          </div>
        </div>
      </section>

      <form action={rebuildBrand} style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <input type="hidden" name="ws" value={id} />
        <Submit className="pr-btn pr-btn-ghost" pending="Starting…">Re-read my site</Submit>
      </form>
    </div>
  );
}
