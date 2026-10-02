import type { Metadata } from 'next';
import { requireWorkspace } from '@/lib/supabase/server';
import { site } from '@/lib/site';
import { PageEditor } from './editor';

export const metadata: Metadata = { title: 'Waitlist' };

export default async function Waitlist({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, ws } = await requireWorkspace(id);
  const [{ data: page }, { data: brain }] = await Promise.all([
    sb.from('waitlist_pages').select('id, slug, headline, subhead, cta, show_badge, published_at').eq('workspace_id', id).maybeSingle(),
    sb.from('brand_brains').select('one_liner, summary').eq('workspace_id', id).maybeSingle(),
  ]);
  const { data: signups, count } = page
    ? await sb.from('waitlist_signups').select('email, source, referral_count, created_at', { count: 'exact' }).eq('page_id', page.id).order('created_at', { ascending: false }).limit(50)
    : { data: [], count: 0 };
  const url = page ? `${site.url}/p/${page.slug}` : null;
  const sources = new Map<string, number>();
  for (const s of signups ?? []) sources.set(s.source, (sources.get(s.source) ?? 0) + 1);

  return (
    <div className="pr-body" style={{ maxWidth: 900 }}>
      <PageEditor
        ws={id}
        paid={ws.plan !== 'free'}
        url={url}
        page={{
          slug: page?.slug ?? '',
          headline: page?.headline ?? brain?.one_liner ?? '',
          subhead: page?.subhead ?? brain?.summary ?? '',
          cta: page?.cta ?? 'Join the waitlist',
          show_badge: page?.show_badge ?? true,
          published: !!page?.published_at,
        }}
        suggestedSlug={ws.product_name}
      />

      {page && (
        <section className="pr-section">
          <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
            <div>
              <h2>Signups</h2>
              <p>{count ? `${count} so far${sources.size ? ` · top source: ${[...sources].sort((a, b) => b[1] - a[1])[0]![0]}` : ''}` : 'Share your page to get your first signup.'}</p>
            </div>
            {!!count && <a className="pr-btn pr-btn-sm" href={`/app/${id}/waitlist/export`}>Export CSV</a>}
          </div>
          {!!signups?.length && (
            <div className="pr-table-wrap" style={{ borderRadius: 0 }}>
              <table className="pr-table" style={{ border: 0, borderRadius: 0 }}>
                <thead><tr><th>Email</th><th>Source</th><th>Referrals</th><th>Joined</th></tr></thead>
                <tbody>
                  {signups.map((s) => (
                    <tr key={s.email + s.created_at}>
                      <td className="t-main">{s.email}</td>
                      <td style={{ color: 'var(--muted)' }}>{s.source}</td>
                      <td>{s.referral_count}</td>
                      <td className="t-time">{new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
