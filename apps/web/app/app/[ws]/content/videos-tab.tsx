import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { CopyText } from './copy';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Needs you', cls: 'pr-chip-warn' }, approved: { label: 'Approved', cls: 'pr-chip-ok' }, scheduled: { label: 'Ready to post', cls: 'pr-chip-ok' },
  published: { label: 'Posted', cls: 'pr-chip-ok' }, rejected: { label: 'Rejected', cls: '' }, failed: { label: 'Blocked', cls: 'pr-chip-err' }, expired: { label: 'Expired', cls: '' },
};

interface Row { id: string; kind: string; idea: string; variant: string; file_url: string | null; slides: string[]; script: { caption?: string; hashtags?: string[]; audio?: string; idea_id?: string; beats?: { text: string }[] }; footage_sources: string[]; licence_ids: string[]; created_at: string; assets: { id: string; status: string; title: string } | null }

/** Short videos (three hook versions each) and carousels, with captions, downloads and the licence for every clip. */
export async function VideosTab({ id, busy }: { id: string; busy: string | null }) {
  const { sb } = await requireWorkspace(id);
  const { data } = await sb.from('ugc_videos').select('id, kind, idea, variant, file_url, slides, script, footage_sources, licence_ids, created_at, assets:asset_id(id, status, title)').eq('workspace_id', id).order('created_at', { ascending: false }).limit(30);
  const rows = (data ?? []) as unknown as Row[];
  const licenceIds = [...new Set(rows.flatMap((r) => r.licence_ids))];
  const { data: lic } = licenceIds.length ? await sb.from('footage_licences').select('id, source, licence_type, attribution, url').in('id', licenceIds) : { data: [] };
  const licences = new Map((lic ?? []).map((l) => [l.id, l]));

  // Group the three hook versions of one video together.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.kind === 'video' ? r.script.idea_id ?? r.id : r.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {busy && (
        <div className="pr-section" aria-busy="true">
          <div className="pr-section-h"><h2>{busy === 'ugc.video' ? 'Rendering three versions' : busy === 'ugc.carousel' ? 'Making your carousel' : 'Finding formats for your audience'}</h2><p>{busy === 'ugc.video' ? 'Same video, three different hooks. About 5 minutes; you can leave this page.' : 'About a minute.'}</p></div>
          {busy === 'ugc.carousel'
            ? <div className="pr-section-b pr-slides">{[0, 1, 2, 3].map((i) => <div key={i} className="sk pr-slide-sk" />)}</div>
            : busy === 'ugc.video' ? <div className="pr-section-b pr-variants">{[0, 1, 2].map((i) => <div key={i} className="sk pr-variant-sk" />)}</div> : null}
        </div>
      )}
      {!rows.length && !busy && (
        <div className="pr-list"><div className="pr-empty"><h2>No videos yet</h2><p>Pick a short video or carousel format and we make it for your product: faceless, on-brand, with three hooks to test.</p><Link className="pr-btn pr-btn-primary" href={`/app/${id}/content?tab=library`} style={{ marginTop: 14 }}>Browse formats</Link></div></div>
      )}
      {[...groups.values()].map((g) => {
        const first = g[0]!;
        const s = first.script;
        const caption = `${s.caption ?? ''}${s.hashtags?.length ? `\n\n${s.hashtags.map((h) => `#${h}`).join(' ')}` : ''}`;
        const used = [...new Set(g.flatMap((r) => r.licence_ids))].map((l) => licences.get(l)).filter(Boolean);
        return (
          <section key={first.id} className="pr-section pr-fade-in">
            <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h2>{first.idea}</h2>
                <p>{first.kind === 'video' ? `${g.length} versions · different hooks, same video` : `Carousel · ${first.slides.length} slides`}{s.audio ? ` · Sound idea: ${s.audio}` : ''}</p>
              </div>
              <Link className="pr-btn pr-btn-sm" href={`/app/${id}/inbox`}>Review in inbox</Link>
            </div>
            <div className="pr-section-b" style={{ display: 'grid', gap: 16 }}>
              {first.kind === 'video' ? (
                <div className="pr-variants">
                  {g.sort((a, b) => a.variant.localeCompare(b.variant)).map((r) => {
                    const st = STATUS[r.assets?.status ?? ''] ?? { label: r.assets?.status ?? 'Ready', cls: '' };
                    return (
                      <figure key={r.id} className="pr-variant">
                        {r.file_url && <video src={`${r.file_url}#t=1`} controls muted playsInline loop preload="metadata" />}
                        <figcaption>
                          <div className="pr-variant-h"><b>Hook {r.variant}</b><span className={`pr-chip ${st.cls}`}>{st.label}</span></div>
                          <p>{r.script.beats?.[0]?.text}</p>
                          {r.file_url && <a className="pr-link" href={r.file_url} download>Download</a>}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              ) : (
                <div className="pr-slides">
                  {first.slides.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer" download><img src={u} alt={`Slide ${i + 1}`} loading="lazy" /></a>
                  ))}
                </div>
              )}
              {caption.trim() && (
                <div className="pr-caption">
                  <div className="pr-variant-h"><b>Caption</b><CopyText text={caption} /></div>
                  <p>{caption}</p>
                </div>
              )}
              <details className="pr-more">
                <summary>Footage and licences ({used.length})</summary>
                <ul className="pr-tips" style={{ padding: '10px 0 0 18px' }}>
                  {used.map((l) => <li key={l!.id}><b>{l!.licence_type}</b>{l!.attribution ? ` · ${l!.attribution}` : ''}{l!.url && l!.source === 'pexels' ? <> · <a className="pr-link" href={l!.url} target="_blank" rel="noopener noreferrer">source</a></> : null}</li>)}
                </ul>
                <p className="pr-hint">Every clip has a licence on record; anything without one can&apos;t be posted. No AI-generated people appear in these videos.</p>
              </details>
            </div>
          </section>
        );
      })}
    </div>
  );
}
