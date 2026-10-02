// SEO blog engine: keyword ideas, article drafts into the inbox, and publishing to the hosted blog
// through the actions service (an internal provider, so it still respects approval and the kill switch).
import {
  ArticleSchema, BLOG_ARTICLE_SYSTEM, BLOG_ARTICLE_VERSION, BLOG_KEYWORDS_SYSTEM, BLOG_KEYWORDS_VERSION, KeywordsSchema, articlePrompt, brandBlock,
  fastModel, findUnsupportedClaims, generate, keywordsPrompt, mockArticle, mockKeywords, smartModel,
} from '@shipitloud/ai';
import { registerProvider } from '@shipitloud/core';
import { PlanLimitError, brandContext, seoScore, slugify } from '@shipitloud/engine';
import { aiLedger, check, db, enqueue } from './db.ts';
import { humanize } from './content.ts';

async function consumeDrafts(workspaceId: string, n: number) {
  const { data } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'ai_drafts', p_amount: n, p_cost: 0 });
  if (!data) throw new PlanLimitError('You’ve used this month’s AI drafts, or your plan doesn’t include the blog.');
}
const refund = (workspaceId: string, n: number) => db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'ai_drafts', p_amount: -n, p_cost: 0 });

/** Every workspace gets one blog; the slug comes from the product name. */
export async function ensureBlog(workspaceId: string) {
  const { data: existing } = await db.from('blogs').select('slug, title').eq('workspace_id', workspaceId).maybeSingle();
  if (existing) return existing;
  const ws = check(await db.from('workspaces').select('product_name').eq('id', workspaceId).single(), 'ws')!;
  const { data: brain } = await db.from('brand_brains').select('one_liner').eq('workspace_id', workspaceId).maybeSingle();
  const base = slugify(ws.product_name, 30).replace(/^-+|-+$/g, '').padEnd(3, 'x');
  for (let i = 0; i < 20; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const { data, error } = await db.from('blogs').insert({ workspace_id: workspaceId, slug, title: `${ws.product_name} blog`, description: brain?.one_liner ?? null }).select('slug, title').single();
    if (!error) return data!;
    if (error.code !== '23505') throw new Error(`create blog: ${error.message}`);
  }
  throw new Error('Could not pick a blog address');
}

/** Keyword ideas: competitor templates (free) plus AI suggestions from the brand and what people ask. */
export async function findKeywords(workspaceId: string) {
  const b = await brandContext(db, workspaceId);
  const [{ data: existing }, { data: heard }] = await Promise.all([
    db.from('seo_keywords').select('keyword').eq('workspace_id', workspaceId),
    db.from('mentions').select('title, text').eq('workspace_id', workspaceId).gte('score', 50).order('score', { ascending: false }).limit(10),
  ]);
  const have = new Set((existing ?? []).map((k) => k.keyword.toLowerCase()));
  const questions = (heard ?? []).map((m) => (m.title || m.text).split('\n')[0]!.replace(/@\w+|https?:\/\/\S+/g, '').slice(0, 140)).filter((q) => q.includes('?') || /^(how|what|which|any|best|is there)/i.test(q));

  const seeds = b.competitors.slice(0, 3).flatMap((c) => [
    { keyword: `${c} alternative`.toLowerCase(), kind: 'alternative', source: 'competitor', why: `People leaving ${c}`, priority: 80 },
    { keyword: `${c} vs ${b.name}`.toLowerCase(), kind: 'versus', source: 'competitor', why: `Comparing ${c} with ${b.name}`, priority: 70 },
  ]);
  await consumeDrafts(workspaceId, 1);
  let ideas;
  try {
    ideas = (await generate({
      ledger: aiLedger, purpose: 'blog_keywords', promptVersion: BLOG_KEYWORDS_VERSION, workspaceId, model: fastModel(),
      system: BLOG_KEYWORDS_SYSTEM, user: keywordsPrompt(b, questions, [...have]), schema: KeywordsSchema, maxTokens: 1200, mock: () => mockKeywords(b),
    })).data.ideas;
  } catch (err) { await refund(workspaceId, 1); throw err; }

  const rows = [...seeds, ...ideas.map((i) => ({ keyword: i.keyword.toLowerCase().trim().slice(0, 120), kind: i.kind, source: questions.some((q) => q.toLowerCase().includes(i.keyword.toLowerCase().split(' ')[0]!)) ? 'listening' : 'brand', why: i.why.slice(0, 200), priority: Math.max(0, Math.min(100, i.priority)) }))]
    .filter((r, i, all) => r.keyword.length >= 4 && !have.has(r.keyword) && all.findIndex((x) => x.keyword === r.keyword) === i)
    .map((r) => ({ ...r, workspace_id: workspaceId }));
  if (rows.length) check(await db.from('seo_keywords').upsert(rows, { onConflict: 'workspace_id,keyword', ignoreDuplicates: true }), 'save keywords');
  return rows.length;
}

/** Draft one article for a keyword. It lands in the inbox; approving it publishes it. */
export async function writeArticle(workspaceId: string, keywordId: string) {
  const k = check(await db.from('seo_keywords').select('id, keyword, kind, why, status').eq('id', keywordId).eq('workspace_id', workspaceId).single(), 'keyword')!;
  if (k.status === 'written') return null;
  const b = await brandContext(db, workspaceId);
  const blog = await ensureBlog(workspaceId);
  const { data: published } = await db.from('blog_posts').select('title, slug').eq('workspace_id', workspaceId).eq('status', 'published').order('published_at', { ascending: false }).limit(12);
  const existing = (published ?? []).map((p) => ({ title: p.title, url: `/blog/${blog.slug}/${p.slug}` }));
  const { data: brain } = await db.from('brand_brains').select('summary, description').eq('workspace_id', workspaceId).maybeSingle();
  const facts = [brain?.summary, brain?.description].filter(Boolean).join(' ').slice(0, 1500);

  await db.from('seo_keywords').update({ status: 'writing' }).eq('id', k.id);
  await consumeDrafts(workspaceId, 2);
  let out;
  try {
    out = await generate({
      ledger: aiLedger, purpose: 'blog_article', promptVersion: BLOG_ARTICLE_VERSION, workspaceId, model: smartModel(),
      system: BLOG_ARTICLE_SYSTEM, user: articlePrompt(b, k, existing, facts), schema: ArticleSchema, maxTokens: 5000, mock: () => mockArticle(b, k.keyword),
    });
  } catch (err) {
    await refund(workspaceId, 2);
    await db.from('seo_keywords').update({ status: 'idea' }).eq('id', k.id);
    throw err;
  }
  const a = out.data;
  const body = humanize(a.body_markdown).replace(/^#\s+.+\n+/, ''); // the title is rendered separately
  const faq = a.faq.slice(0, 6).map((f) => ({ q: humanize(f.q), a: humanize(f.a) }));
  const meta = { title: humanize(a.meta_title).slice(0, 70), description: humanize(a.meta_description).slice(0, 170) };

  // A unique, clean slug.
  let slug = slugify(a.slug || a.title, 60);
  const { data: taken } = await db.from('blog_posts').select('slug').eq('workspace_id', workspaceId).like('slug', `${slug}%`);
  if (taken?.some((t) => t.slug === slug)) slug = `${slug.slice(0, 55)}-${(taken?.length ?? 0) + 1}`;

  const seo = seoScore({ keyword: k.keyword, title: a.title, slug, metaTitle: meta.title, metaDescription: meta.description, body, faq, competitors: b.competitors });
  const flags = findUnsupportedClaims([body, ...faq.map((f) => f.a)].join('\n'), `${brandBlock(b)}\n${facts}`);
  if (seo.claims.length) flags.push(`${seo.claims.length} statement${seo.claims.length === 1 ? '' : 's'} about other products to check`);
  if (seo.verify.length) flags.push(`${seo.verify.length} fact${seo.verify.length === 1 ? '' : 's'} to check: ${seo.verify.slice(0, 2).join('; ')}`);

  const post = check(await db.from('blog_posts').insert({
    workspace_id: workspaceId, keyword_id: k.id, keyword: k.keyword, title: humanize(a.title).slice(0, 120), slug, excerpt: humanize(a.excerpt).slice(0, 300),
    body, meta, faq, seo_score: seo.score, seo_tips: seo.tips, status: 'draft',
  }).select('id').single(), 'save article')!;
  const asset = check(await db.from('assets').insert({
    workspace_id: workspaceId, type: 'article', platform: 'blog', title: `Article: ${a.title}`.slice(0, 140), status: 'pending',
    content: { post_id: post.id, text: `${a.excerpt}\n\n${seo.words.toLocaleString('en-US')} words · SEO score ${seo.score}${seo.tips[0] ? ` · ${seo.tips[0]}` : ''}`, keyword: k.keyword, blog_slug: blog.slug, slug },
    flags, confidence: flags.length ? 55 : seo.score, qa_score: seo.score, publish_score: seo.score, prompt_version: BLOG_ARTICLE_VERSION, model: out.model,
  }).select('id').single(), 'article asset')!;
  await db.from('blog_posts').update({ asset_id: asset.id }).eq('id', post.id);
  await db.from('seo_keywords').update({ status: 'written' }).eq('id', k.id);
  await enqueue(workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
  return post.id as string;
}

// Publishing to our own blog: internal, so it runs in test mode too, but only after approval and never with the kill switch on.
registerProvider({
  id: 'blog',
  automatic: true,
  internal: true,
  async execute(payload) {
    const postId = String(payload.post_id ?? '');
    const { data: post } = await db.from('blog_posts').select('id, workspace_id, slug, published_at').eq('id', postId).single();
    if (!post) throw new Error('Article not found');
    const { data: blog } = await db.from('blogs').select('slug').eq('workspace_id', post.workspace_id).single();
    check(await db.from('blog_posts').update({ status: 'published', published_at: post.published_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', post.id), 'publish');
    return { externalId: post.id, url: `/blog/${blog?.slug}/${post.slug}` };
  },
});
