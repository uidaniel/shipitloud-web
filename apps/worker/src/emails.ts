// Emails to the waitlist: the four-step sequence and one-off broadcasts. Drafted by AI, approved in the inbox,
// sent with one-click unsubscribe and the business address; each email reaches each person at most once.
import {
  BROADCAST_SYSTEM, BROADCAST_VERSION, BroadcastSchema, WAITLIST_EMAILS_SYSTEM, WAITLIST_EMAILS_VERSION, WaitlistEmailsSchema, brandBlock, broadcastPrompt,
  fastModel, findUnsupportedClaims, generate, mockBroadcast, mockWaitlistEmails, waitlistEmailsPrompt,
} from '@shipitloud/ai';
import { registerProvider } from '@shipitloud/core';
import { PlanLimitError, SEQUENCE, brandContext, dueKinds, fill, fromAddress, renderEmail, sendEmail, unsubscribeToken, type SequenceKind } from '@shipitloud/engine';
import { themeFromPalette } from '@shipitloud/templates';
import { aiLedger, check, db, enqueue } from './db.ts';
import { humanize } from './content.ts';
import { appUrl } from './env.ts';

async function consume(workspaceId: string, n: number) {
  const { data } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'ai_drafts', p_amount: n, p_cost: 0 });
  if (!data) throw new PlanLimitError('You’ve used this month’s AI drafts.');
}

/** Draft the four waitlist emails into the inbox. A new set replaces drafts still waiting. */
export async function draftWaitlistEmails(workspaceId: string) {
  const b = await brandContext(db, workspaceId);
  await consume(workspaceId, 4);
  const out = await generate({
    ledger: aiLedger, purpose: 'waitlist_emails', promptVersion: WAITLIST_EMAILS_VERSION, workspaceId, model: fastModel(),
    system: WAITLIST_EMAILS_SYSTEM, user: waitlistEmailsPrompt(b), schema: WaitlistEmailsSchema, maxTokens: 2000, mock: () => mockWaitlistEmails(b),
  });
  const TITLES: Record<SequenceKind, string> = { welcome: 'Welcome email', referral_nudge: 'Referral nudge (day 2)', countdown: 'Launch countdown (day before)', launch_day: 'Launch day email' };
  await db.from('assets').update({ status: 'rejected' }).eq('workspace_id', workspaceId).eq('type', 'email').eq('status', 'pending').eq('prompt_version', WAITLIST_EMAILS_VERSION);
  // What each email must do is guaranteed here, not left to the model: the welcome always shows the person's place
  // and share link, the nudge always has the link, the countdown always says "tomorrow", buttons match their link.
  const fixed = (kind: SequenceKind, e: { subject: string; body: string; cta_label: string }) => {
    let { subject, body } = e;
    if (kind === 'welcome' && !body.includes('{{position}}')) body += `\n\nYou're #{{position}} on the list.`;
    if ((kind === 'welcome' || kind === 'referral_nudge') && !body.includes('{{referral_link}}')) body += `\n\nShare your link to move up: {{referral_link}}`;
    if (kind === 'countdown' && !/tomorrow/i.test(subject)) subject = `${b.name} opens tomorrow`;
    if (kind === 'countdown') body = body.replace(/\bin \d+ (days?|weeks?)\b/gi, 'tomorrow');
    if (kind === 'launch_day') body = body.replace(/\{\{\s*status_link\s*\}\}/g, '{{product_url}}'); // launch day points at the product
    const cta = kind === 'welcome' || kind === 'referral_nudge' ? 'Share your link' : kind === 'countdown' ? 'See your place' : e.cta_label || `Try ${b.name}`;
    return { subject, body, cta_label: cta };
  };
  const rows = SEQUENCE.map((kind) => {
    const e = fixed(kind, out.data[kind]);
    const flags = findUnsupportedClaims(`${e.subject} ${e.body}`, brandBlock(b));
    return {
      workspace_id: workspaceId, type: 'email', platform: 'email', title: TITLES[kind], status: 'pending', prompt_version: WAITLIST_EMAILS_VERSION, model: out.model, flags,
      confidence: flags.length ? 60 : 80, content: { sequence: true, kind, subject: humanize(e.subject).slice(0, 120), text: humanize(e.body), cta_label: humanize(e.cta_label).slice(0, 40) },
    };
  });
  const { data } = await db.from('assets').insert(rows).select('id');
  for (const a of data ?? []) await enqueue(workspaceId, 'asset.intake', { asset_id: a.id }, { key: `intake:${a.id}` });
  return data?.length ?? 0;
}

/** One email to everyone on the waitlist, about one thing. Sent when approved. */
export async function draftBroadcast(workspaceId: string, topic: string) {
  const b = await brandContext(db, workspaceId);
  await consume(workspaceId, 1);
  const out = await generate({
    ledger: aiLedger, purpose: 'broadcast', promptVersion: BROADCAST_VERSION, workspaceId, model: fastModel(),
    system: BROADCAST_SYSTEM, user: broadcastPrompt(b, topic), schema: BroadcastSchema, maxTokens: 800, mock: () => mockBroadcast(b, topic),
  });
  const flags = findUnsupportedClaims(`${out.data.subject} ${out.data.body}`, brandBlock(b));
  const asset = check(await db.from('assets').insert({
    workspace_id: workspaceId, type: 'email', platform: 'email', title: `Email to your waitlist: ${humanize(out.data.subject)}`.slice(0, 140), status: 'pending',
    prompt_version: BROADCAST_VERSION, model: out.model, flags, confidence: flags.length ? 60 : 75,
    content: { kind: 'broadcast', topic: topic.slice(0, 300), subject: humanize(out.data.subject).slice(0, 120), text: humanize(out.data.body), cta_label: humanize(out.data.cta_label).slice(0, 40), workspace_id: workspaceId },
  }).select('id').single(), 'broadcast')!;
  await db.from('assets').update({ content: { kind: 'broadcast', topic: topic.slice(0, 300), subject: humanize(out.data.subject).slice(0, 120), text: humanize(out.data.body), cta_label: humanize(out.data.cta_label).slice(0, 40), workspace_id: workspaceId, asset_id: asset.id } }).eq('id', asset.id);
  await enqueue(workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
  return asset.id as string;
}

// ---------------------------------------------------------------- sending
export interface Ctx { workspaceId: string; product: string; productUrl: string | null; slug: string | null; settings: { from_name: string | null; reply_to: string | null; business_address: string; sending_domain: string | null; domain_verified: boolean }; theme: { accent: string; onAccent: string } }
interface Signup { id: string; email: string; referral_code: string; position: number; referral_count: number; created_at: string; unsubscribed_at: string | null }

export async function context(workspaceId: string): Promise<Ctx | { problem: string }> {
  const [{ data: ws }, { data: st }, { data: page }, { data: kit }] = await Promise.all([
    db.from('workspaces').select('product_name, url, kill_switch').eq('id', workspaceId).single(),
    db.from('email_settings').select('from_name, reply_to, business_address, sending_domain, domain_verified').eq('workspace_id', workspaceId).maybeSingle(),
    db.from('waitlist_pages').select('slug').eq('workspace_id', workspaceId).maybeSingle(),
    db.from('brand_kits').select('palette').eq('workspace_id', workspaceId).maybeSingle(),
  ]);
  if (!ws) return { problem: 'Workspace not found' };
  if (ws.kill_switch) return { problem: 'Kill switch is on' };
  if (!st?.business_address?.trim()) return { problem: 'Add your business address (Waitlist → Emails). The law requires it in marketing emails.' };
  const t = themeFromPalette(kit?.palette ?? []);
  return { workspaceId, product: ws.product_name, productUrl: ws.url, slug: page?.slug ?? null, settings: { ...st, business_address: st.business_address.trim() }, theme: { accent: t.accent, onAccent: t.onAccent } };
}

async function sendOne(ctx: Ctx, asset: { id: string; content: Record<string, unknown> }, kind: string, s: Signup) {
  const base = appUrl();
  const vars = {
    product: ctx.product, product_url: ctx.productUrl ?? '', position: s.position,
    referral_link: ctx.slug ? `${base}/p/${ctx.slug}?ref=${s.referral_code}` : ctx.productUrl ?? '',
    status_link: ctx.slug ? `${base}/p/${ctx.slug}/s/${s.referral_code}` : '',
  };
  const c = asset.content as { subject: string; text: string; cta_label?: string };
  const ctaUrl = kind === 'welcome' || kind === 'referral_nudge' ? vars.referral_link : kind === 'countdown' ? vars.status_link || ctx.productUrl : ctx.productUrl;
  const token = unsubscribeToken(s.id);
  const unsub = `${base}/u/${token}`;            // footer link: a page with a button (link scanners can't unsubscribe people)
  const oneClick = `${base}/api/unsubscribe/${token}`; // List-Unsubscribe header: RFC 8058 one-click POST
  const { html, text } = renderEmail({
    subject: fill(c.subject, vars), body: fill(c.text, vars), brand: { name: ctx.product, accent: ctx.theme.accent, onAccent: ctx.theme.onAccent },
    cta: c.cta_label && ctaUrl ? { label: c.cta_label, url: ctaUrl } : null,
    footer: { address: ctx.settings.business_address, unsubscribeUrl: unsub, reason: `You're getting this because you joined the ${ctx.product} waitlist.` },
  });
  // Claim the send first (unique per email and person), so a retry or a second worker can never double-send.
  const { error: claimed } = await db.from('email_sends').insert({ workspace_id: ctx.workspaceId, asset_id: asset.id, signup_id: s.id, kind, status: 'simulated' });
  if (claimed) return 'skipped';
  try {
    const r = await sendEmail({ from: fromAddress({ fromName: ctx.settings.from_name ?? '', product: ctx.product, domain: ctx.settings.sending_domain, verified: ctx.settings.domain_verified }), replyTo: ctx.settings.reply_to, to: s.email, subject: fill(c.subject, vars), html, text, unsubscribeUrl: oneClick });
    await db.from('email_sends').update({ status: r.simulated ? 'simulated' : 'sent', provider_id: r.id }).eq('asset_id', asset.id).eq('signup_id', s.id);
    return r.simulated ? 'simulated' : 'sent';
  } catch (err) {
    await db.from('email_sends').update({ status: 'failed', error: (err as Error).message.slice(0, 300) }).eq('asset_id', asset.id).eq('signup_id', s.id);
    return 'failed';
  }
}

/** The waitlist sequence: send whatever is due now. Runs every 10 minutes; at most `limit` emails per run. */
export async function runSequence(workspaceId: string, limit = 200) {
  const { data: on } = await db.from('email_settings').select('sequence_on').eq('workspace_id', workspaceId).maybeSingle();
  if (!on?.sequence_on) return { sent: 0, reason: 'off' };
  const ctx = await context(workspaceId);
  if ('problem' in ctx) return { sent: 0, reason: ctx.problem };
  const { data: templates } = await db.from('assets').select('id, content, updated_at').eq('workspace_id', workspaceId).eq('type', 'email').in('status', ['approved', 'auto_approved']).eq('prompt_version', WAITLIST_EMAILS_VERSION).order('updated_at', { ascending: false });
  const byKind = new Map<string, { id: string; content: Record<string, unknown> }>();
  for (const t of templates ?? []) { const k = String((t.content as { kind?: string }).kind); if (!byKind.has(k)) byKind.set(k, t); }
  if (!byKind.size) return { sent: 0, reason: 'nothing approved' };
  const { data: ws } = await db.from('workspaces').select('launch_date').eq('id', workspaceId).single();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: signups } = await db.from('waitlist_signups').select('id, email, referral_code, position, referral_count, created_at, unsubscribed_at').eq('workspace_id', workspaceId).eq('consent', true).is('unsubscribed_at', null).eq('flagged', false).gte('created_at', since).limit(5000);
  if (!signups?.length) return { sent: 0, reason: 'no signups' };
  const { data: sends } = await db.from('email_sends').select('signup_id, kind').eq('workspace_id', workspaceId).in('kind', SEQUENCE);
  const sentBy = new Map<string, Set<string>>();
  for (const x of sends ?? []) { if (!sentBy.has(x.signup_id)) sentBy.set(x.signup_id, new Set()); sentBy.get(x.signup_id)!.add(x.kind); }
  let sent = 0;
  for (const s of signups as Signup[]) {
    if (sent >= limit) break;
    for (const kind of dueKinds(s, { now: new Date(), launchDate: ws?.launch_date ?? null, sent: sentBy.get(s.id) ?? new Set(), active: new Set(byKind.keys()) })) {
      const r = await sendOne(ctx, byKind.get(kind)!, kind, s);
      if (r !== 'skipped') sent++;
    }
  }
  return { sent };
}

// Broadcasts go through the actions gate (approval, kill switch, idempotency, audit). Nothing leaves outside live
// mode: sendEmail records those as simulated.
registerProvider({
  id: 'email',
  automatic: true,
  internal: true,
  async execute(payload) {
    if (payload.kind === 'winback') return (await import('./lifecycle.ts')).sendWinback(payload);
    if (payload.kind !== 'broadcast') return { copyAndPost: { text: String(payload.text ?? ''), openUrl: 'mailto:' } };
    const workspaceId = String(payload.workspace_id ?? '');
    const ctx = await context(workspaceId);
    if ('problem' in ctx) throw new Error(ctx.problem);
    const { data: signups } = await db.from('waitlist_signups').select('id, email, referral_code, position, referral_count, created_at, unsubscribed_at').eq('workspace_id', workspaceId).eq('consent', true).is('unsubscribed_at', null).eq('flagged', false).limit(10_000);
    const counts = { sent: 0, simulated: 0, failed: 0, skipped: 0 };
    for (const s of (signups ?? []) as Signup[]) counts[await sendOne(ctx, { id: String(payload.asset_id), content: payload }, 'broadcast', s) as keyof typeof counts]++;
    return { externalId: `broadcast:${payload.asset_id}`, stats: counts };
  },
});
