'use client';

import { useActionState, useEffect, useState } from 'react';
import { Submit, kept, keptOn } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { savePage } from '../../actions';

interface PageData { slug: string; headline: string; subhead: string; cta: string; show_badge: boolean; published: boolean }

export function PageEditor({ ws, page, url, paid, suggestedSlug }: { ws: string; page: PageData; url: string | null; paid: boolean; suggestedSlug: string }) {
  const [state, action] = useActionState(savePage, {});
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!state.ok) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [state]);
  const base = url ? url.slice(0, url.lastIndexOf('/') + 1) : '/p/';

  return (
    <form action={action} className="pr-section" key={page.slug + page.published}>
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Waitlist page</h2>
          <p>A page in your brand colors, with referrals built in. Share it anywhere.</p>
        </div>
        {url && page.published && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="pr-btn pr-btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} }}>
              {copied ? Icon.check : Icon.copy} {copied ? 'Copied' : 'Copy link'}
            </button>
            <a className="pr-btn pr-btn-sm" href={url} target="_blank" rel="noopener noreferrer">{Icon.external} Open</a>
          </div>
        )}
      </div>
      <div className="pr-section-b">
        <div>
          <label className="pr-label" htmlFor="slug">Page address</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span style={{ height: 38, display: 'inline-flex', alignItems: 'center', padding: '0 10px', border: '1px solid var(--line-2)', borderRight: 0, borderRadius: '9px 0 0 9px', color: 'var(--faint)', fontSize: 13, whiteSpace: 'nowrap', background: 'var(--panel-2)' }}>{base}</span>
            <input id="slug" name="slug" className="pr-input" style={{ borderRadius: '0 9px 9px 0' }} defaultValue={kept(state, 'slug', page.slug)} placeholder={suggestedSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-')} />
          </div>
        </div>
        <div><label className="pr-label" htmlFor="headline">Headline</label><input id="headline" name="headline" className="pr-input" defaultValue={kept(state, 'headline', page.headline)} maxLength={90} /></div>
        <div><label className="pr-label" htmlFor="subhead">One or two lines under it</label><textarea id="subhead" name="subhead" className="pr-textarea" defaultValue={kept(state, 'subhead', page.subhead)} rows={3} maxLength={240} style={{ minHeight: 0 }} /></div>
        <div style={{ maxWidth: 300 }}><label className="pr-label" htmlFor="cta">Button</label><input id="cta" name="cta" className="pr-input" defaultValue={kept(state, 'cta', page.cta)} maxLength={30} /></div>
        <div className="pr-row">
          <div className="pr-row-t"><b>Published</b><span>{page.published ? 'Live. Anyone with the link can join.' : 'Hidden until you publish.'}</span></div>
          <span className="pr-switch"><input type="checkbox" name="publish" defaultChecked={keptOn(state, 'publish', page.published)} aria-label="Published" /><i /></span>
        </div>
        <div className="pr-row">
          <div className="pr-row-t"><b>“Launched with ShipItLoud” badge</b><span>{paid ? 'Show the small badge in the footer.' : 'Included on the free plan. Remove it with the Launch Pass.'}</span></div>
          <span className="pr-switch"><input type="checkbox" name="show_badge" defaultChecked={keptOn(state, 'show_badge', paid ? page.show_badge : true)} disabled={!paid} aria-label="Show badge" /><i /></span>
        </div>
        <p className="pr-hint" style={{ margin: 0 }}>Signups give consent to launch emails. You own the list and can export or delete it any time.</p>
      </div>
      <div className="pr-section-f">
        {state.error && <span className="pr-error" role="alert" style={{ margin: 0, marginRight: 'auto' }}>{state.error}</span>}
        {saved && <span className="pr-fade-in" style={{ marginRight: 'auto', color: 'var(--ok)', fontSize: 13, alignSelf: 'center' }}>Saved</span>}
        <Submit pending="Saving…">Save</Submit>
      </div>
    </form>
  );
}
