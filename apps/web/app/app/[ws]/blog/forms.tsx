'use client';

import { useActionState, useEffect, useState } from 'react';
import { Submit } from '@/components/app/ui';
import { addKeyword, saveArticle, saveBlog } from '../../actions';

function Saved({ state, text = 'Saved' }: { state: { ok?: boolean; error?: string }; text?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!state.ok) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [state]);
  if (state.error) return <span className="pr-error" role="alert" style={{ margin: 0, marginRight: 'auto' }}>{state.error}</span>;
  return show ? <span className="pr-fade-in" style={{ marginRight: 'auto', color: 'var(--ok)', fontSize: 13, alignSelf: 'center' }}>{text}</span> : null;
}

export function BlogSettings({ ws, slug, title, description, origin }: { ws: string; slug: string; title: string; description: string; origin: string }) {
  const [state, action] = useActionState(saveBlog, {});
  const [s, setS] = useState(slug);
  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h"><h2>Blog settings</h2><p>Your own domain (blog.yourproduct.com) can be connected later.</p></div>
      <div className="pr-section-b" style={{ display: 'grid', gap: 14 }}>
        <div>
          <label className="pr-label" htmlFor="bslug">Address</label>
          <div className="pr-prefix"><span>{origin}/blog/</span><input id="bslug" name="slug" className="pr-input" value={s} onChange={(e) => setS(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={40} /></div>
        </div>
        <div className="pr-grid-2">
          <div><label className="pr-label" htmlFor="btitle">Title</label><input id="btitle" name="title" className="pr-input" defaultValue={title} maxLength={80} /></div>
          <div><label className="pr-label" htmlFor="bdesc">One-line description</label><input id="bdesc" name="description" className="pr-input" defaultValue={description} maxLength={200} /></div>
        </div>
      </div>
      <div className="pr-section-f"><Saved state={state} /><Submit pending="Saving…">Save</Submit></div>
    </form>
  );
}

export function AddKeyword({ ws }: { ws: string }) {
  const [state, action] = useActionState(addKeyword, {});
  return (
    <form action={action} className="pr-inline-form" key={state.ok ? String(Date.now()) : 'k'}>
      <input type="hidden" name="ws" value={ws} />
      <input name="keyword" className="pr-input" placeholder="Add your own: what would someone type into Google?" maxLength={120} aria-label="Keyword" />
      <Submit className="pr-btn" pending="Adding…">Add</Submit>
      {state.error && <span className="pr-error" role="alert" style={{ margin: 0, flexBasis: '100%' }}>{state.error}</span>}
    </form>
  );
}

export function ArticleEditor({ ws, post }: { ws: string; post: { id: string; title: string; body: string; meta: { title?: string; description?: string } } }) {
  const [state, action] = useActionState(saveArticle, {});
  const [mt, setMt] = useState(post.meta.title ?? '');
  const [md, setMd] = useState(post.meta.description ?? '');
  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      <input type="hidden" name="post" value={post.id} />
      <div className="pr-section-b" style={{ display: 'grid', gap: 14 }}>
        <div><label className="pr-label" htmlFor="at">Title</label><input id="at" name="title" className="pr-input" defaultValue={post.title} maxLength={140} /></div>
        <div className="pr-grid-2">
          <div>
            <label className="pr-label" htmlFor="amt">Search title <span className={`pr-count-hint ${mt.length > 60 ? 'over' : ''}`}>{mt.length}/60</span></label>
            <input id="amt" name="meta_title" className="pr-input" value={mt} onChange={(e) => setMt(e.target.value)} maxLength={90} />
          </div>
          <div>
            <label className="pr-label" htmlFor="amd">Search description <span className={`pr-count-hint ${md.length > 160 || md.length < 110 ? 'over' : ''}`}>{md.length}/160</span></label>
            <input id="amd" name="meta_description" className="pr-input" value={md} onChange={(e) => setMd(e.target.value)} maxLength={200} />
          </div>
        </div>
        <div>
          <label className="pr-label" htmlFor="ab">Article (Markdown: ## for headings, - for lists, [text](link) for links)</label>
          <textarea id="ab" name="body" className="pr-textarea pr-editor" defaultValue={post.body} spellCheck />
        </div>
      </div>
      <div className="pr-section-f"><Saved state={state} text="Saved. Score updated." /><Submit pending="Saving…">Save changes</Submit></div>
    </form>
  );
}
