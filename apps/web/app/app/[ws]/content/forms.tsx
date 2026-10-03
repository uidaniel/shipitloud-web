'use client';

import { useActionState, useEffect, useState } from 'react';
import { Submit, kept, keptOn } from '@/components/app/ui';
import { addManualUpdate, createWebhookSecret, saveContentSources, saveVoiceSamples } from '../../actions';

function useSaved(state: { ok?: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!state.ok) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [state]);
  return show;
}

function Status({ state, saved, text = 'Saved' }: { state: { error?: string }; saved: boolean; text?: string }) {
  if (state.error) return <span className="pr-error" role="alert" style={{ margin: 0, marginRight: 'auto' }}>{state.error}</span>;
  return saved ? <span className="pr-fade-in" style={{ marginRight: 'auto', color: 'var(--ok)', fontSize: 13, alignSelf: 'center' }}>{text}</span> : null;
}

export function SourcesForm({ ws, feed, repo, weekly }: { ws: string; feed: string; repo: string; weekly: boolean }) {
  const [state, action] = useActionState(saveContentSources, {});
  const saved = useSaved(state);
  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h"><h2>Where your updates come from</h2><p>When something new shows up here, we draft an X post and a LinkedIn post about it. We check every 6 hours.</p></div>
      <div className="pr-section-b pr-grid-2">
        <div>
          <label className="pr-label" htmlFor="feed">Changelog or blog feed (RSS)</label>
          <input id="feed" name="changelog_url" className="pr-input" defaultValue={kept(state, 'changelog_url', feed)} placeholder="yourproduct.com/changelog/rss.xml" />
        </div>
        <div>
          <label className="pr-label" htmlFor="repo">GitHub repository (public releases)</label>
          <input id="repo" name="github_repo" className="pr-input" defaultValue={kept(state, 'github_repo', repo)} placeholder="owner/name" />
        </div>
        <label className="pr-check-row" style={{ gridColumn: '1 / -1' }}>
          <input type="checkbox" name="weekly_plan" defaultChecked={keptOn(state, 'weekly_plan', weekly)} />
          <span><b>Plan next week for me every Sunday</b><small>Five posts land in your inbox for approval. Nothing goes out without you unless you use trust mode.</small></span>
        </label>
      </div>
      <div className="pr-section-f"><Status state={state} saved={saved} /><Submit pending="Saving…">Save</Submit></div>
    </form>
  );
}

export function WebhookForm({ ws, url }: { ws: string; url: string }) {
  const [state, action] = useActionState(createWebhookSecret, {});
  const [copied, setCopied] = useState('');
  const copy = async (v: string, k: string) => { await navigator.clipboard.writeText(v); setCopied(k); };
  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h"><h2>Instant updates from GitHub (optional)</h2><p>Add a webhook so releases, and pushes with &ldquo;feat:&rdquo; commits, turn into posts right away.</p></div>
      <div className="pr-section-b" style={{ display: 'grid', gap: 12 }}>
        <ol className="pr-howto">
          <li>In your repo: Settings → Webhooks → Add webhook.</li>
          <li>Payload URL is the link below. Content type: application/json.</li>
          <li>Paste the secret, choose &ldquo;Releases&rdquo; and &ldquo;Pushes&rdquo;, then save.</li>
        </ol>
        <div className="pr-token"><code>{url}</code><button type="button" className="pr-btn pr-btn-sm" onClick={() => copy(url, 'url')}>{copied === 'url' ? 'Copied' : 'Copy'}</button></div>
        {state.secret && (
          <div className="pr-banner pr-banner-info pr-fade-in" style={{ margin: 0, display: 'grid', gap: 8 }}>
            <b>Your secret. It won&apos;t be shown again.</b>
            <div className="pr-token"><code>{state.secret}</code><button type="button" className="pr-btn pr-btn-sm" onClick={() => copy(state.secret!, 'secret')}>{copied === 'secret' ? 'Copied' : 'Copy'}</button></div>
          </div>
        )}
        {state.error && <p className="pr-error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
      </div>
      <div className="pr-section-f"><Submit className="pr-btn" pending="Creating…">{state.secret ? 'Create a new secret' : 'Create secret'}</Submit></div>
    </form>
  );
}

export function ManualUpdateForm({ ws }: { ws: string }) {
  const [state, action] = useActionState(addManualUpdate, {});
  const saved = useSaved(state);
  return (
    <form action={action} className="pr-section" key={state.ok ? Date.now() : 'f'}>
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h"><h2>Shipped something?</h2><p>Tell us in a line. We draft the posts.</p></div>
      <div className="pr-section-b" style={{ display: 'grid', gap: 12 }}>
        <div><label className="pr-label" htmlFor="ut">What shipped</label><input id="ut" name="title" className="pr-input" placeholder="Clients can now pay a deposit up front" maxLength={200} /></div>
        <div><label className="pr-label" htmlFor="ub">Details (optional)</label><textarea id="ub" name="body" className="pr-textarea" style={{ minHeight: 70 }} placeholder="Who it helps and how it works." /></div>
      </div>
      <div className="pr-section-f"><Status state={state} saved={saved} text="Got it. Drafting posts…" /><Submit pending="Saving…">Draft posts about it</Submit></div>
    </form>
  );
}

export function VoiceForm({ ws, samples }: { ws: string; samples: string[] }) {
  const [state, action] = useActionState(saveVoiceSamples, {});
  const saved = useSaved(state);
  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h"><h2>Your past posts</h2><p>Paste 3 to 10 posts you wrote yourself, with a line of <b>---</b> between them. Drafts will match how you write.</p></div>
      <div className="pr-section-b">
        <textarea name="samples" className="pr-textarea" style={{ minHeight: 260 }} defaultValue={kept(state, 'samples', samples.join('\n\n---\n\n'))} placeholder={'First post you wrote…\n\n---\n\nSecond post…'} />
      </div>
      <div className="pr-section-f"><Status state={state} saved={saved} text="Saved. Learning your voice…" /><Submit pending="Saving…">Save and learn my voice</Submit></div>
    </form>
  );
}
