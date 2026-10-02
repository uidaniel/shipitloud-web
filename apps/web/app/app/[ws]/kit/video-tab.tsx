import Link from 'next/link';
import { requireWorkspace, supabaseAdmin } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { makeDemoVideo, removeShot } from '../../actions';
import { KitRefresher } from './refresher';
import { ShotUploader } from './shot-uploader';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Needs you', cls: 'pr-chip-warn' }, approved: { label: 'Approved', cls: 'pr-chip-ok' },
  auto_approved: { label: 'Auto-approved', cls: 'pr-chip-violet' }, scheduled: { label: 'Ready to post', cls: 'pr-chip-ok' },
  published: { label: 'Posted', cls: 'pr-chip-ok' },
};
const CUTS = [['story', '9:16', 'Reels, TikTok, Shorts'], ['square', '1:1', 'Feeds'], ['landscape', '16:9', 'X, YouTube, your site']] as const;

interface VideoContent { cuts?: Partial<Record<'story' | 'square' | 'landscape', string>>; script?: { hook: string; captions: string[]; cta: string }; music?: string }

export async function VideoTab({ id }: { id: string }) {
  const { sb } = await requireWorkspace(id);
  const admin = supabaseAdmin();
  const [{ data: brain }, { data: videos }, { data: running }, { data: files }] = await Promise.all([
    sb.from('brand_brains').select('status').eq('workspace_id', id).maybeSingle(),
    sb.from('assets').select('id, title, status, content, flags, created_at').eq('workspace_id', id).eq('type', 'video').neq('status', 'rejected').order('created_at', { ascending: false }).limit(5),
    sb.from('jobs').select('id').eq('workspace_id', id).eq('type', 'kit.video').in('status', ['queued', 'running']).limit(1),
    admin.storage.from('assets').list(`${id}/shots`, { sortBy: { column: 'created_at', order: 'asc' } }),
  ]);
  const busy = !!running?.length;
  const shots = (files ?? []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name)).map((f) => ({ name: f.name, url: admin.storage.from('assets').getPublicUrl(`${id}/shots/${f.name}`).data.publicUrl }));

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {busy && <KitRefresher />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Demo video</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13, maxWidth: 560 }}>A 20-second silent demo with on-screen captions, in three sizes. No camera, no voiceover.</p>
        </div>
        {brain?.status === 'ready' ? (
          <form action={makeDemoVideo}>
            <input type="hidden" name="ws" value={id} />
            <Submit className="pr-btn pr-btn-primary" pending="Starting…" disabled={busy}>{busy ? 'Rendering…' : videos?.length ? 'Make a new video' : 'Make my demo video'}</Submit>
          </form>
        ) : <Link className="pr-btn pr-btn-primary" href={`/app/setup/${id}`}>Set up your brand first</Link>}
      </div>

      <div className="pr-section">
        <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2>Screenshots</h2>
            <p>{shots.length ? `${shots.length} of 5. These go in the video, in this order.` : 'Optional. Add screens from inside your product. Without them, we film your homepage.'}</p>
          </div>
          <ShotUploader ws={id} room={5 - shots.length} />
        </div>
        {shots.length > 0 && (
          <div className="pr-section-b pr-shots">
            {shots.map((s, i) => (
              <div key={s.name} className="pr-shot">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt={`Screenshot ${i + 1}`} loading="lazy" />
                <form action={removeShot}>
                  <input type="hidden" name="ws" value={id} />
                  <input type="hidden" name="name" value={s.name} />
                  <button className="pr-shot-x" aria-label="Remove screenshot">{Icon.x}</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {busy && (
        <div className="pr-section" aria-busy="true">
          <div className="pr-section-h"><h2>Rendering three cuts</h2><p>This takes about 3 minutes. You can leave this page; we&apos;ll let you know.</p></div>
          <div className="pr-section-b pr-cuts">
            {CUTS.map(([k]) => <div key={k} className={`sk pr-cut-${k}`} />)}
          </div>
        </div>
      )}

      {videos?.map((v, i) => {
        const c = v.content as VideoContent;
        const s = STATUS[v.status] ?? { label: v.status, cls: '' };
        return (
          <div key={v.id} className="pr-section pr-fade-in">
            <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2>{v.title}</h2>
                <p>{new Date(v.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{c.music ? ` · Music idea: ${c.music}` : ''}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {v.flags?.map((f: string) => <span key={f} className="pr-chip pr-chip-err">{f}</span>)}
                <span className={`pr-chip ${s.cls}`}>{s.label}</span>
                {v.status === 'pending' && <Link className="pr-btn pr-btn-sm" href={`/app/${id}/inbox`}>Review</Link>}
              </div>
            </div>
            <div className="pr-section-b" style={{ display: 'grid', gap: 18 }}>
              <div className="pr-cuts">
                {CUTS.map(([k, label, where]) => c.cuts?.[k] ? (
                  <figure key={k} className={`pr-cut pr-cut-${k}`}>
                    <video src={`${c.cuts[k]}#t=3`} controls muted playsInline loop preload={i === 0 ? 'metadata' : 'none'} />
                    <figcaption>
                      <span><b>{label}</b> {where}</span>
                      <a href={c.cuts[k]} download className="pr-link">Download</a>
                    </figcaption>
                  </figure>
                ) : null)}
              </div>
              {c.script && (
                <ol className="pr-script">
                  <li><b>Hook</b>{c.script.hook}</li>
                  {c.script.captions.map((t, n) => <li key={n}><b>Screen {n + 1}</b>{t}</li>)}
                  <li><b>End card</b>{c.script.cta}</li>
                </ol>
              )}
            </div>
          </div>
        );
      })}

      {!busy && !videos?.length && (
        <div className="pr-list"><div className="pr-empty"><h2>No video yet</h2><p>We take screenshots, write short captions in your voice, and animate them with your logo and colors.</p></div></div>
      )}
    </div>
  );
}
