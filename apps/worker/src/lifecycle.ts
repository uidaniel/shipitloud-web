// Signup-to-paid: the four onboarding emails to the founder's own users (approved once, then sent when each is due,
// once per person), and churn alerts: paying users whose activity falls get flagged, with a win-back email drafted
// for the founder to approve.
import {
  LIFECYCLE_EMAILS_VERSION, LIFECYCLE_SYSTEM, LifecycleEmailsSchema, WINBACK_SYSTEM, WINBACK_VERSION, WinbackSchema, brandBlock, fastModel,
  findUnsupportedClaims, generate, lifecyclePrompt, mockLifecycleEmails, mockWinback, winbackPrompt,
} from '@shipitloud/ai';
import {
  LIFECYCLE, PlanLimitError, brandContext, churnRisk, dueLifecycle, fill, fromAddress, renderEmail, sendEmail, unsubscribeToken, type LifecycleKind, type LifecycleUser,
} from '@shipitloud/engine';
import { aiLedger, check, db, enqueue } from './db.ts';
import { context, type Ctx } from './emails.ts';
import { humanize } from './content.ts';
import { appUrl } from './env.ts';

async function consume(workspaceId: string, n: number) {
  const { data } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'ai_drafts', p_amount: n, p_cost: 0 });
  if (!data) throw new PlanLimitError('You’ve used this month’s AI drafts.');
}

async function settings(workspaceId: string) {
  const { data } = await db.from('lifecycle_settings').select('emails_on, activation_event, upgrade_url, churn_alerts').eq('workspace_id', workspaceId).maybeSingle();
  return { emails_on: !!data?.emails_on, activation_event: data?.activation_event ?? 'activated', upgrade_url: data?.upgrade_url ?? null, churn_alerts: data?.churn_alerts ?? true };
}

const TITLES: Record<LifecycleKind, string> = { welcome: 'Welcome email (new users)', activation_nudge: 'Activation nudge (day 2, not activated)', trial_ending: 'Trial ending (3 days before)', upgrade_offer: 'Upgrade offer (active free users)' };

/** Draft the four onboarding emails into the inbox. A new set replaces drafts still waiting. */
export async function draftLifecycleEmails(workspaceId: string) {
  const b = await brandContext(db, workspaceId);
  const s = await settings(workspaceId);
  await consume(workspaceId, 4);
  const out = await generate({
    ledger: aiLedger, purpose: 'lifecycle_emails', promptVersion: LIFECYCLE_EMAILS_VERSION, workspaceId, model: fastModel(),
    system: LIFECYCLE_SYSTEM, user: lifecyclePrompt(b, s.activation_event), schema: LifecycleEmailsSchema, maxTokens: 2000, mock: () => mockLifecycleEmails(b),
  });
  await db.from('assets').update({ status: 'rejected' }).eq('workspace_id', workspaceId).eq('type', 'email').eq('status', 'pending').eq('content->>lifecycle', 'true');
  const facts = brandBlock(b);
  for (const kind of LIFECYCLE) {
    const e = out.data[kind];
    let body = humanize(e.body);
    // Never "in 3 days" in a trial email: the runner sends it anywhere from 3 days to hours before the end.
    if (kind === 'trial_ending') body = body.replace(/\bin (\d+|one|two|three|four|five|six|seven) days?\b/gi, 'soon');
    const flags = findUnsupportedClaims(`${e.subject} ${body}`, facts);
    const asset = check(await db.from('assets').insert({
      workspace_id: workspaceId, type: 'email', platform: 'email', title: TITLES[kind], status: 'pending', prompt_version: LIFECYCLE_EMAILS_VERSION, model: out.model,
      flags, confidence: flags.length ? 60 : 80,
      content: { lifecycle: true, kind, subject: humanize(e.subject).slice(0, 120), text: body, cta_label: humanize(e.cta_label).slice(0, 40) },
    }).select('id').single(), 'lifecycle email')!;
    await enqueue(workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
  }
  return LIFECYCLE.length;
}

interface EndUser extends LifecycleUser { id: string; name: string | null }

function message(ctx: Ctx, c: { subject: string; text: string; cta_label?: string }, u: { id: string; name: string | null }, ctaUrl: string | null, reason: string) {
  const base = appUrl();
  const first = (u.name ?? '').trim().split(/\s+/)[0] ?? '';
  const vars = { name: first, product: ctx.product, product_url: ctx.productUrl ?? '', upgrade_url: ctaUrl ?? ctx.productUrl ?? '' };
  // "Hi ," reads badly when we don't know the name.
  const tidy = (t: string) => fill(t, vars).replace(/^(Hi|Hey|Hello) ,/m, '$1,').replace(/^(Hi|Hey|Hello)\s*,/m, '$1,');
  const token = unsubscribeToken(u.id);
  const { html, text } = renderEmail({
    subject: tidy(c.subject), body: tidy(c.text), brand: { name: ctx.product, accent: ctx.theme.accent, onAccent: ctx.theme.onAccent },
    cta: c.cta_label && ctaUrl ? { label: c.cta_label, url: ctaUrl } : null,
    footer: { address: ctx.settings.business_address, unsubscribeUrl: `${base}/u/${token}`, reason },
  });
  return { subject: tidy(c.subject), html, text, oneClick: `${base}/api/unsubscribe/${token}` };
}

async function sendToUser(ctx: Ctx, asset: { id: string; content: Record<string, unknown> }, kind: string, u: EndUser & { email: string }, ctaUrl: string | null) {
  const m = message(ctx, asset.content as { subject: string; text: string; cta_label?: string }, u, ctaUrl, `You're getting this because you signed up for ${ctx.product}.`);
  // Claim first (unique per email and person): retries and a second worker can never double-send.
  const { error: claimed } = await db.from('lifecycle_sends').insert({ workspace_id: ctx.workspaceId, asset_id: asset.id, end_user_id: u.id, kind, status: 'simulated' });
  if (claimed) return 'skipped' as const;
  try {
    const r = await sendEmail({ from: fromAddress({ fromName: ctx.settings.from_name ?? '', product: ctx.product, domain: ctx.settings.sending_domain, verified: ctx.settings.domain_verified }), replyTo: ctx.settings.reply_to, to: u.email, subject: m.subject, html: m.html, text: m.text, unsubscribeUrl: m.oneClick });
    await db.from('lifecycle_sends').update({ status: r.simulated ? 'simulated' : 'sent', provider_id: r.id }).eq('asset_id', asset.id).eq('end_user_id', u.id);
    return r.simulated ? 'simulated' as const : 'sent' as const;
  } catch (err) {
    await db.from('lifecycle_sends').update({ status: 'failed', error: (err as Error).message.slice(0, 300) }).eq('asset_id', asset.id).eq('end_user_id', u.id);
    return 'failed' as const;
  }
}

/** Send whatever lifecycle email is due for each user. Runs every 10 minutes; at most `limit` per run. */
export async function runLifecycle(workspaceId: string, limit = 200) {
  const s = await settings(workspaceId);
  if (!s.emails_on) return { sent: 0, reason: 'off' };
  const ctx = await context(workspaceId);
  if ('problem' in ctx) return { sent: 0, reason: ctx.problem };
  const { data: templates } = await db.from('assets').select('id, content, updated_at').eq('workspace_id', workspaceId).eq('type', 'email').in('status', ['approved', 'auto_approved']).eq('content->>lifecycle', 'true').order('updated_at', { ascending: false });
  const byKind = new Map<string, { id: string; content: Record<string, unknown> }>();
  for (const t of templates ?? []) { const k = String((t.content as { kind?: string }).kind); if (!byKind.has(k)) byKind.set(k, t); }
  if (!byKind.size) return { sent: 0, reason: 'nothing approved' };
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: users } = await db.from('end_users').select('id, email, name, status, signed_up_at, activated_at, trial_ends_at, unsubscribed_at')
    .eq('workspace_id', workspaceId).not('email', 'is', null).is('unsubscribed_at', null).neq('status', 'churned').gte('signed_up_at', since).limit(5000);
  if (!users?.length) return { sent: 0, reason: 'no users' };
  const { data: sends } = await db.from('lifecycle_sends').select('end_user_id, kind').eq('workspace_id', workspaceId).in('end_user_id', users.map((u) => u.id));
  const sentBy = new Map<string, Set<string>>();
  for (const x of sends ?? []) { if (!sentBy.has(x.end_user_id)) sentBy.set(x.end_user_id, new Set()); sentBy.get(x.end_user_id)!.add(x.kind); }
  let sent = 0;
  for (const u of users as (EndUser & { email: string })[]) {
    if (sent >= limit) break;
    const kind = dueLifecycle(u, { now: new Date(), sent: sentBy.get(u.id) ?? new Set(), active: new Set(byKind.keys()) });
    if (!kind) continue;
    const cta = kind === 'trial_ending' || kind === 'upgrade_offer' ? s.upgrade_url ?? ctx.productUrl : ctx.productUrl;
    if ((await sendToUser(ctx, byKind.get(kind)!, kind, u, cta)) !== 'skipped') sent++;
  }
  return { sent };
}

/**
 * Churn alerts: paying users whose activity fell are flagged once, and a personal win-back email is drafted for
 * each into the inbox. Users whose activity recovers are unflagged. Runs at most once a day per workspace.
 */
export async function checkChurn(workspaceId: string, now = new Date()) {
  const s = await settings(workspaceId);
  if (!s.churn_alerts) return { flagged: 0 };
  await db.from('lifecycle_settings').upsert({ workspace_id: workspaceId, last_churn_check: now.toISOString() }, { onConflict: 'workspace_id' });
  const { data: act, error } = await db.rpc('user_activity', { p_ws: workspaceId });
  if (error) throw new Error(`activity: ${error.message}`);
  const rows = (act ?? []) as { end_user_id: string; recent: number; previous: number; last_event: string | null }[];
  if (!rows.length) return { flagged: 0 };
  const { data: us } = await db.from('end_users').select('id, email, name, at_risk_at, unsubscribed_at').in('id', rows.map((r) => r.end_user_id));
  const byId = new Map((us ?? []).map((u) => [u.id as string, u]));
  const fresh: { id: string; email: string | null; name: string | null; reason: string }[] = [];
  for (const r of rows) {
    const u = byId.get(r.end_user_id);
    if (!u) continue;
    const { risk, reason } = churnRisk(r, now);
    if (risk && !u.at_risk_at) fresh.push({ id: u.id, email: u.email, name: u.name, reason });
    if (!risk && u.at_risk_at) await db.from('end_users').update({ at_risk_at: null, updated_at: now.toISOString() }).eq('id', u.id);
  }
  if (!fresh.length) return { flagged: 0 };
  await db.from('end_users').update({ at_risk_at: now.toISOString(), updated_at: now.toISOString() }).in('id', fresh.map((f) => f.id));

  // One AI draft per run, personalised per user; only users we can email (and who haven't opted out) get one.
  const reachable = fresh.filter((f) => f.email && !byId.get(f.id)?.unsubscribed_at);
  if (reachable.length) {
    const b = await brandContext(db, workspaceId);
    await consume(workspaceId, 1);
    const out = await generate({
      ledger: aiLedger, purpose: 'winback', promptVersion: WINBACK_VERSION, workspaceId, model: fastModel(),
      system: WINBACK_SYSTEM, user: winbackPrompt(b), schema: WinbackSchema, maxTokens: 600, mock: () => mockWinback(b),
    });
    const flags = findUnsupportedClaims(`${out.data.subject} ${out.data.body}`, brandBlock(b));
    for (const f of reachable) {
      const first = (f.name ?? '').trim().split(/\s+/)[0] ?? '';
      const content = {
        kind: 'winback', end_user_id: f.id, to: f.email, reason: f.reason, workspace_id: workspaceId,
        // Filled now, so the founder approves exactly what the customer will read.
        subject: fill(humanize(out.data.subject), { name: first, product: b.name, product_url: b.url ?? '' }).slice(0, 120),
        text: fill(humanize(out.data.body), { name: first, product: b.name, product_url: b.url ?? '' }).replace(/^(Hi|Hey|Hello)\s*,/m, '$1,'), cta_label: humanize(out.data.cta_label).slice(0, 40),
      };
      const asset = check(await db.from('assets').insert({
        workspace_id: workspaceId, type: 'email', platform: 'email', title: `Win-back: ${f.name || f.email}`.slice(0, 140), status: 'pending',
        prompt_version: WINBACK_VERSION, model: out.model, flags, confidence: 60,   // a person's email: always the founder's call
        content,
      }).select('id').single(), 'winback')!;
      await db.from('assets').update({ content: { ...content, asset_id: asset.id } }).eq('id', asset.id);
      await enqueue(workspaceId, 'asset.intake', { asset_id: asset.id }, { key: `intake:${asset.id}` });
    }
  }
  const n = fresh.length;
  await enqueue(workspaceId, 'notify', {
    kind: 'churn_alert', title: `${n} paying ${n === 1 ? 'customer is' : 'customers are'} going quiet`,
    body: `${fresh.slice(0, 3).map((f) => `${f.name || f.email || 'A user'}: ${f.reason}`).join('\n')}${reachable.length ? `\n\nWe drafted ${reachable.length === 1 ? 'a personal email' : `${reachable.length} personal emails`} for you to check in your inbox.` : ''}`,
    url: `${appUrl()}/app/${workspaceId}/customers#risk`,
  }, { key: `notify:churn:${workspaceId}:${now.toISOString().slice(0, 10)}` });
  return { flagged: n };
}

/** Send one approved win-back email (called by the email provider, through the actions gate). */
export async function sendWinback(payload: Record<string, unknown>) {
  const workspaceId = String(payload.workspace_id ?? '');
  const ctx = await context(workspaceId);
  if ('problem' in ctx) throw new Error(ctx.problem);
  const { data: u } = await db.from('end_users').select('id, email, name, status, signed_up_at, activated_at, trial_ends_at, unsubscribed_at').eq('id', String(payload.end_user_id ?? '')).eq('workspace_id', workspaceId).maybeSingle();
  if (!u?.email) throw new Error('This customer has no email address on record.');
  if (u.unsubscribed_at) return { externalId: `winback:${payload.asset_id}`, stats: { skipped: 1 } };
  const r = await sendToUser(ctx, { id: String(payload.asset_id), content: payload }, 'winback', u as EndUser & { email: string }, ctx.productUrl);
  return { externalId: `winback:${payload.asset_id}`, stats: { [r]: 1 } };
}
