// Landing page audit and network launch messages. The audit reads the page in code and asks the AI for the top fix
// per area; quotes must be on the page and rewrites must pass the claim check. Network messages are personal, sent
// by the founder one at a time from their own phone or account, each with its own tracked link.
import { chromium } from 'playwright-core';
import {
  NETWORK_SYSTEM, NETWORK_VERSION, NetworkSchema, PAGE_AUDIT_SYSTEM, PAGE_AUDIT_VERSION, PageAuditSchema, brandBlock, fastModel, findUnsupportedClaims,
  generate, mockNetwork, mockPageAudit, networkPrompt, pageAuditPrompt, type PageAudit,
} from '@shipitloud/ai';
import { PlanLimitError, auditHints, brandContext, createShortLink, extractPage, isInstruction, onPage, shortQuote } from '@shipitloud/engine';
import { aiLedger, check, db } from './db.ts';
import { humanize } from './content.ts';
import { appUrl } from './env.ts';

async function consume(workspaceId: string, n: number) {
  const { data } = await db.rpc('consume_usage', { p_workspace: workspaceId, p_metric: 'ai_drafts', p_amount: n, p_cost: 0 });
  if (!data) throw new PlanLimitError('You’ve used this month’s AI drafts.');
}

async function fetchHtml(url: string) {
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShipItLoudAudit/1.0; +https://shipitloud.com)', Accept: 'text/html' } });
  } catch {
    throw new Error('we couldn’t open it. Check the link in Settings and that the site is online.');
  }
  if (!res.ok) throw new Error(`it returned an error (${res.status}).`);
  return (await res.text()).slice(0, 900_000);
}

/** Pages built in the browser show almost nothing to a plain fetch; render those. */
export async function renderHtml(url: string) {
  const browser = await chromium.launch({ executablePath: process.env.VIDEO_BROWSER || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => page.waitForTimeout(3000));
    return await page.content();
  } finally { await browser.close(); }
}

/** Audit the landing page: our checks, then the top fix for clarity, call to action and trust. */
export async function auditLandingPage(workspaceId: string, rawUrl: string) {
  const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).toString();
  try {
    let facts = extractPage(await fetchHtml(url));
    if (!facts.h1.length && facts.words < 80) {
      try { const r = extractPage(await renderHtml(url)); if (r.words > facts.words) facts = r; } catch { /* keep what the fetch saw */ }
    }
    if (facts.words < 5) throw new Error('we could open it but found almost no text on it.');
    const hints = auditHints(facts);
    await consume(workspaceId, 1);
    const b = await brandContext(db, workspaceId);
    const page = [`Title: ${facts.title}`, `Meta description: ${facts.description || '(none)'}`, `Main headline: ${facts.h1.join(' | ') || '(none)'}`,
      `Buttons: ${facts.ctas.join(' | ') || '(none)'}`, `Email forms: ${facts.forms}`, '', facts.text].join('\n');
    const out = await generate({
      ledger: aiLedger, purpose: 'page_audit', promptVersion: PAGE_AUDIT_VERSION, workspaceId, model: fastModel(),
      system: PAGE_AUDIT_SYSTEM, user: pageAuditPrompt(b, page, hints.map((h) => `- (${h.area}) ${h.issue}`).join('\n')), schema: PageAuditSchema, maxTokens: 900,
      mock: () => mockPageAudit(facts.h1[0] ?? facts.title, facts.ctas[0] ?? ''),
    });
    // Quotes must really be on the page; rewrites may only use facts from the brand or the page.
    const known = `${brandBlock(b)}\n${page}`;
    const fixes = Object.fromEntries((['clarity', 'cta', 'trust'] as const).map((k) => {
      const f = out.data[k];
      const quote = f.quote && onPage(f.quote, facts) ? shortQuote(f.quote) : '';
      const rewrite = f.rewrite && !isInstruction(f.rewrite) && !findUnsupportedClaims(f.rewrite, known).length ? humanize(f.rewrite) : '';
      return [k, { problem: humanize(f.problem), quote, fix: humanize(f.fix), rewrite }];
    })) as PageAudit;
    const row = check(await db.from('page_audits').insert({
      workspace_id: workspaceId, url, facts: { ...facts, text: undefined }, fixes, hints, model: out.model, prompt_version: PAGE_AUDIT_VERSION,
    }).select('id').single(), 'save audit')!;
    return row.id as string;
  } catch (err) {
    if (err instanceof PlanLimitError) throw err;
    await db.from('page_audits').insert({ workspace_id: workspaceId, url, status: 'failed', error: err instanceof Error ? err.message.slice(0, 300) : 'Failed' });
    return null;
  }
}

const KINDS = ['friends', 'professional', 'peers', 'linkedin_post'] as const;
const SOURCE: Record<(typeof KINDS)[number], string> = { friends: 'whatsapp', professional: 'linkedin', peers: 'email', linkedin_post: 'linkedin' };

/** Draft the personal launch messages, each with its own tracked link so you can see which circle responds. */
export async function draftNetworkKit(workspaceId: string) {
  const b = await brandContext(db, workspaceId);
  await consume(workspaceId, 1);
  const out = await generate({
    ledger: aiLedger, purpose: 'network_launch', promptVersion: NETWORK_VERSION, workspaceId, model: fastModel(),
    system: NETWORK_SYSTEM, user: networkPrompt(b), schema: NetworkSchema, maxTokens: 1200, mock: () => mockNetwork(b),
  });
  const facts = brandBlock(b);
  const messages: Record<string, string> = {};
  const flags: Record<string, string[]> = {};
  for (const k of KINDS) {
    let t = humanize(out.data[k]).replace(/\{\{\s*name\s*\}\}/gi, '{{name}}').replace(/\{\{\s*link\s*\}\}/gi, '{{link}}');
    if (k !== 'linkedin_post' && !t.includes('{{name}}')) t = `Hi {{name}}, ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
    if (!t.includes('{{link}}')) t += `\n\n{{link}}`;
    // The LinkedIn note only works with a line only the founder can write; make sure the gap is there.
    if (k === 'professional' && !/\[why them\]/i.test(t)) {
      const end = t.search(/[.!?](\s|$)/);
      t = end > 0 ? `${t.slice(0, end + 1)} I thought of you because [why them].${t.slice(end + 1)}` : `${t}\n\nI thought of you because [why them].`;
    }
    messages[k] = t;
    const f = findUnsupportedClaims(t, facts);
    if (f.length) flags[k] = f;
  }
  // Keep links already made, so ones the founder has sent keep counting.
  const prev = (await db.from('network_kits').select('links, sent').eq('workspace_id', workspaceId).maybeSingle()).data as { links: Record<string, string>; sent: Record<string, number> } | null;
  const links: Record<string, string> = { ...(prev?.links ?? {}) };
  if (b.url) {
    for (const k of KINDS) {
      if (links[k]) continue;
      const code = await createShortLink(db, workspaceId, { target: b.url, source: SOURCE[k], medium: 'personal', campaign: 'network-launch' });
      links[k] = `${appUrl()}/l/${code}`;
    }
  }
  check(await db.from('network_kits').upsert({
    workspace_id: workspaceId, messages: { ...messages, flags }, links, sent: prev?.sent ?? {}, model: out.model, prompt_version: NETWORK_VERSION, updated_at: new Date().toISOString(),
  }), 'save network kit');
}
