'use client';

import { useActionState, useEffect, useState } from 'react';
import { Submit, kept, keptOn } from '@/components/app/ui';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { saveListening } from '../../actions';

export interface ListenValues { keywords: string[]; competitors: string[]; exclude: string[]; sources: string[]; rss_feeds: string[]; threshold: number }
interface SourceOption { id: string; name: string; icon: Platform; note: string; locked?: string }

/** What to listen for. `start` is the first-run version: it switches listening on and looks back 30 days. */
export function ListenForm({ ws, values, options, monitors, start }: { ws: string; values: ListenValues; options: SourceOption[]; monitors: number; start?: boolean }) {
  const [state, action] = useActionState(saveListening, {});
  const [picked, setPicked] = useState<string[]>(values.sources);
  const [threshold, setThreshold] = useState(values.threshold);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!state.ok) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [state]);
  const full = picked.length >= monitors;

  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      {start && <input type="hidden" name="start" value="1" />}
      <div className="pr-section-h">
        <h2>{start ? 'What should we listen for?' : 'Listening settings'}</h2>
        <p>{start ? 'We filled this in from your brand. Short phrases people would actually type work best.' : 'Changes apply from the next check.'}</p>
      </div>
      <div className="pr-section-b" style={{ display: 'grid', gap: 18 }}>
        <div className="pr-grid-2">
          <div>
            <label className="pr-label" htmlFor="kw">Phrases, one per line</label>
            <textarea id="kw" name="keywords" className="pr-textarea" defaultValue={kept(state, 'keywords', values.keywords.join('\n'))} placeholder={'invoice app\nchasing clients for payment'} />
            <p className="pr-hint">Problems people complain about and what they search for. Up to 10.</p>
          </div>
          <div>
            <label className="pr-label" htmlFor="cp">Competitors, one per line</label>
            <textarea id="cp" name="competitors" className="pr-textarea" defaultValue={kept(state, 'competitors', values.competitors.join('\n'))} placeholder={'FreshBooks\nWave'} />
            <p className="pr-hint">We also look for &ldquo;alternative to&rdquo; each one. Write names the way the brand does. Up to 5.</p>
          </div>
        </div>

        <fieldset className="pr-fieldset">
          <legend className="pr-label">Where to listen <span style={{ color: 'var(--faint)' }}>· your plan covers {monitors}</span></legend>
          <div className="pr-sources">
            {options.map((o) => {
              const on = picked.includes(o.id);
              const disabled = !!o.locked || (!on && full);
              return (
                <label key={o.id} className="pr-source" data-on={on || undefined} aria-disabled={disabled || undefined}>
                  <input type="checkbox" name="sources" value={o.id} defaultChecked={keptOn(state, 'sources', values.sources.includes(o.id), o.id)} disabled={disabled}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.id] : p.filter((x) => x !== o.id)))} />
                  <PlatformIcon name={o.icon} size={22} />
                  <span><b>{o.name}</b><small>{o.locked ?? o.note}</small></span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {picked.includes('rss') && (
          <div className="pr-fade-in">
            <label className="pr-label" htmlFor="rss">Feed links, one per line</label>
            <textarea id="rss" name="rss_feeds" className="pr-textarea" style={{ minHeight: 80 }} defaultValue={kept(state, 'rss_feeds', values.rss_feeds.join('\n'))} placeholder="https://news.example.com/feed.xml" />
            <p className="pr-hint">Blogs, newsletters or forums with an RSS feed. We keep posts that mention your phrases.</p>
          </div>
        )}

        <details className="pr-more">
          <summary>More options</summary>
          <div style={{ display: 'grid', gap: 18, paddingTop: 14 }}>
            <div>
              <label className="pr-label" htmlFor="th">Show me conversations scoring at least <b style={{ color: 'var(--text)' }}>{threshold}</b> / 100</label>
              <input id="th" className="pr-range" type="range" name="threshold" min={30} max={95} step={5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
              <p className="pr-hint">Lower shows more, but more of it is noise. We only draft replies on our own for 70 and up.</p>
            </div>
            <div>
              <label className="pr-label" htmlFor="ex">Ignore posts containing, one per line</label>
              <textarea id="ex" name="exclude" className="pr-textarea" style={{ minHeight: 70 }} defaultValue={kept(state, 'exclude', values.exclude.join('\n'))} placeholder={'crypto\nhiring'} />
            </div>
          </div>
        </details>
      </div>
      <div className="pr-section-f">
        {state.error && <span className="pr-error" role="alert" style={{ margin: 0, marginRight: 'auto' }}>{state.error}</span>}
        {saved && !start && <span className="pr-fade-in" style={{ marginRight: 'auto', color: 'var(--ok)', fontSize: 13, alignSelf: 'center' }}>Saved</span>}
        <Submit pending={start ? 'Starting…' : 'Saving…'}>{start ? 'Start listening' : 'Save'}</Submit>
      </div>
    </form>
  );
}
