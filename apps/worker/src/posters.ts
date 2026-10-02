import { randomUUID } from 'node:crypto';
import { BudgetExceededError, findUnsupportedClaims, POSTERS_SYSTEM, POSTERS_VERSION, PostersSchema, fastModel, generate, mockPosters, postersPrompt } from '@shipitloud/ai';
import { FORMATS, TEMPLATES, prepareLogo, qa, renderPng, themeFromPalette, type FormatId } from '@shipitloud/templates';
import { aiLedger, check, db, enqueue } from './db.ts';

const DEFAULT_SET = ['announce', 'feature', 'countdown', 'problem', 'steps', 'cta'];

/** Launch kit posters: AI writes the words, templates do the design, QA gates what reaches the inbox. */
export async function makePosters(workspaceId: string, opts: { templates?: string[]; format?: FormatId } = {}) {
  const format: FormatId = opts.format && FORMATS[opts.format] ? opts.format : 'portrait';
  const ws = check(await db.from('workspaces').select('product_name, url, launch_date, plan').eq('id', workspaceId).single(), 'ws')!;
  const [brain, voice, kit] = await Promise.all([
    db.from('brand_brains').select('status, one_liner, target_customer, pain_points').eq('workspace_id', workspaceId).maybeSingle(),
    db.from('voice_profiles').select('tone').eq('workspace_id', workspaceId).maybeSingle(),
    db.from('brand_kits').select('logo_url, palette').eq('workspace_id', workspaceId).maybeSingle(),
  ]);
  if (brain.data?.status !== 'ready') throw new Error('Set up your brand first so posters sound like you.');

  // Brand kit: logo as PNG + palette from its pixels (k-means), merged with the site's theme color.
  const logo = kit.data?.logo_url ? await prepareLogo(kit.data.logo_url) : null;
  const palette = [...new Set([...(kit.data?.palette ?? []), ...(logo?.palette ?? [])].map((c) => c.toLowerCase()))].slice(0, 6);
  if (palette.length !== (kit.data?.palette ?? []).length) await db.from('brand_kits').update({ palette }).eq('workspace_id', workspaceId);
  const theme = themeFromPalette(palette);

  const chosen = TEMPLATES.filter((t) => (opts.templates ?? DEFAULT_SET).includes(t.id));
  const daysToLaunch = ws.launch_date ? Math.max(0, Math.ceil((Date.parse(ws.launch_date) - Date.now()) / 86_400_000)) : null;

  let out;
  try {
    out = await generate({
      ledger: aiLedger, purpose: 'posters', promptVersion: POSTERS_VERSION, workspaceId, model: fastModel(),
      system: POSTERS_SYSTEM,
      user: postersPrompt({ name: ws.product_name, url: ws.url, one_liner: brain.data.one_liner, target_customer: brain.data.target_customer, pain_points: brain.data.pain_points ?? [], tone: voice.data?.tone ?? null, days_to_launch: daysToLaunch }, chosen),
      schema: PostersSchema, maxTokens: 1500, mock: () => mockPosters(ws.product_name, chosen),
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return { made: 0, skipped: chosen.length, reason: 'AI budget reached for this month' };
    throw err;
  }

  let made = 0;
  const skipped: string[] = [];
  for (const poster of out.data.posters) {
    const tpl = chosen.find((t) => t.id === poster.template_id);
    if (!tpl) continue;
    const slots = Object.fromEntries(poster.slots.map((s) => [s.key, s.value]));
    const brand = { name: ws.product_name, url: ws.url, logo: logo?.dataUri ?? null };
    const check1 = qa({ templateId: tpl.id, format, slots, theme, brand });
    const facts = [brain.data.one_liner, brain.data.target_customer, ...(brain.data.pain_points ?? []), daysToLaunch != null ? `${daysToLaunch} days` : ''].join(' ');
    const claimFlags = tpl.id === 'countdown' ? [] : findUnsupportedClaims(Object.values(slots).join(' '), facts);
    if (check1.blocker) { skipped.push(`${tpl.name}: ${check1.issues.join(', ')}`); continue; }

    // Plan cap: every rendered image counts.
    const { data: allowed } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'images', p_amount: 1, p_cost: 0 });
    if (!allowed) { skipped.push(`${tpl.name}: monthly image limit reached`); continue; }

    const png = await renderPng({ templateId: tpl.id, format, slots, theme, brand });
    const path = `${workspaceId}/posters/${randomUUID()}.png`;
    const up = await db.storage.from('assets').upload(path, png, { contentType: 'image/png', upsert: false });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    const fileUrl = db.storage.from('assets').getPublicUrl(path).data.publicUrl;

    const { data: asset } = await db.from('assets').insert({
      workspace_id: workspaceId, type: 'poster', platform: 'instagram', title: poster.title,
      content: { template: tpl.id, format, slots, qa_issues: check1.issues },
      file_url: fileUrl, template_id: tpl.id, qa_score: check1.score, publish_score: check1.score, confidence: claimFlags.length ? 60 : check1.score, flags: claimFlags,
      prompt_version: POSTERS_VERSION, model: out.model,
    }).select('id').single();
    if (asset) await enqueue(workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
    made++;
  }
  if (skipped.length) console.log(`[posters] skipped: ${skipped.join(' | ')}`);
  return { made, skipped: skipped.length };
}

/** Cut text to a slot's limit at a word boundary, never mid-word, and drop dangling punctuation. */
export function fitWords(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  // Prefer ending on a whole clause; otherwise a whole word.
  const clause = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  if (clause > max * 0.5) return cut.slice(0, clause).trim();
  const at = cut.lastIndexOf(' ');
  let out = (at > max * 0.5 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:\-–]+$/, '');
  // Don't end on a word that needs a next one ("lands in your").
  for (let i = 0; i < 3; i++) out = out.replace(/\s+(a|an|the|your|my|our|their|in|on|at|to|of|and|or|for|with|from|by|is|are|that|which|who|when|so|but|as|than|into)$/i, '').replace(/[\s,;:\-–]+$/, '');
  return out;
}

/** One poster from given words (used by repurposing): same brand look, QA and plan cap as the launch set. */
export async function posterFromSlots(workspaceId: string, templateId: string, slotsIn: Record<string, string>, title: string, extra: { content?: Record<string, unknown>; scheduled_for?: string | null } = {}) {
  const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES.find((t) => t.id === 'quote')!;
  // Keep only this template's slots, cut to their limits.
  const slots = Object.fromEntries(Object.entries(tpl.slots).map(([k, spec]) => [k, fitWords(slotsIn[k] ?? '', spec.max)]).filter(([, v]) => v));
  const ws = check(await db.from('workspaces').select('product_name, url').eq('id', workspaceId).single(), 'ws')!;
  const kit = (await db.from('brand_kits').select('logo_url, palette').eq('workspace_id', workspaceId).maybeSingle()).data;
  const logo = kit?.logo_url ? await prepareLogo(kit.logo_url) : null;
  const theme = themeFromPalette([...(kit?.palette ?? []), ...(logo?.palette ?? [])]);
  const format: FormatId = 'portrait';
  const brand = { name: ws.product_name, url: ws.url, logo: logo?.dataUri ?? null };
  const q = qa({ templateId: tpl.id, format, slots, theme, brand });
  if (q.blocker) return { skipped: q.issues.join(', ') };
  const { data: allowed } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'images', p_amount: 1, p_cost: 0 });
  if (!allowed) return { skipped: 'monthly image limit reached' };
  const png = await renderPng({ templateId: tpl.id, format, slots, theme, brand });
  const path = `${workspaceId}/posters/${randomUUID()}.png`;
  const up = await db.storage.from('assets').upload(path, png, { contentType: 'image/png', upsert: false });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  const fileUrl = db.storage.from('assets').getPublicUrl(path).data.publicUrl;
  const asset = check(await db.from('assets').insert({
    workspace_id: workspaceId, type: 'poster', platform: 'instagram', title,
    content: { template: tpl.id, format, slots, qa_issues: q.issues, ...extra.content },
    file_url: fileUrl, template_id: tpl.id, qa_score: q.score, publish_score: q.score, confidence: q.score, scheduled_for: extra.scheduled_for ?? null,
    prompt_version: 'repurpose@1',
  }).select('id').single(), 'poster asset')!;
  await enqueue(workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
  return { assetId: asset.id as string };
}
