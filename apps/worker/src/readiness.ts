// Launch readiness check (PRD section 5): will the site hold up when people show up? A checklist, not a
// security product. Pure HTTP checks, no AI cost.
import { db } from './db.ts';

export interface CheckResult { check: string; ok: boolean; detail: string; fix?: string; weight: number }

async function get(url: string, method: 'GET' | 'HEAD' = 'GET', redirect: RequestRedirect = 'follow') {
  const t0 = Date.now();
  const res = await fetch(url, { method, redirect, signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'ShipItLoudReadiness/1.0 (+https://shipitloud.com)' } });
  return { res, ms: Date.now() - t0 };
}

const meta = (html: string, key: string) => {
  for (const tag of html.match(/<meta[^>]+>/gi) ?? []) {
    const k = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (k === key) return tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
  }
  return undefined;
};

export async function runReadiness(workspaceId: string, rawUrl: string) {
  const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  const results: CheckResult[] = [];
  const add = (r: CheckResult) => results.push(r);

  // 1. HTTPS + redirect from http.
  let html = '';
  let headers = new Headers();
  let ttfb = 0;
  try {
    const { res, ms } = await get(url.toString());
    html = (await res.text()).slice(0, 800_000);
    headers = res.headers;
    ttfb = ms;
    add({ check: 'Site is reachable', ok: res.ok, detail: `${res.status} in ${ms} ms`, fix: res.ok ? undefined : 'Your site returned an error. Fix it before sending people there.', weight: 20 });
    add({ check: 'HTTPS', ok: res.url.startsWith('https://'), detail: res.url.startsWith('https://') ? 'Valid certificate' : 'Served over plain HTTP', fix: 'Turn on HTTPS at your host. Browsers warn visitors on plain HTTP.', weight: 10 });
  } catch (err) {
    add({ check: 'Site is reachable', ok: false, detail: err instanceof Error ? err.message : 'Failed to load', fix: 'We couldn’t open your site. Check the link and that it’s online.', weight: 20 });
  }
  try {
    const { res } = await get(`http://${url.host}${url.pathname}`, 'GET', 'manual');
    const loc = res.headers.get('location') ?? '';
    const ok = res.status >= 300 && res.status < 400 && loc.startsWith('https://');
    add({ check: 'HTTP redirects to HTTPS', ok, detail: ok ? 'Redirects' : `No redirect (status ${res.status})`, fix: 'Redirect all http:// traffic to https:// in your host settings.', weight: 4 });
  } catch {
    add({ check: 'HTTP redirects to HTTPS', ok: true, detail: 'HTTP not served', weight: 4 });
  }

  // 2. Security headers.
  const hsts = !!headers.get('strict-transport-security');
  const frame = !!headers.get('x-frame-options') || /frame-ancestors/i.test(headers.get('content-security-policy') ?? '');
  const nosniff = (headers.get('x-content-type-options') ?? '').toLowerCase() === 'nosniff';
  const missing = [!hsts && 'HSTS', !frame && 'X-Frame-Options', !nosniff && 'X-Content-Type-Options'].filter(Boolean);
  add({ check: 'Security headers', ok: !missing.length, detail: missing.length ? `Missing: ${missing.join(', ')}` : 'HSTS, frame protection, nosniff', fix: 'Add the missing headers in your host or framework config (one line each on Vercel, Netlify or Cloudflare).', weight: 6 });

  // 3. Social previews.
  const ogTitle = meta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const ogDesc = meta(html, 'og:description') ?? meta(html, 'description');
  const ogImage = meta(html, 'og:image');
  let imageOk = false;
  if (ogImage) {
    try { imageOk = (await get(new URL(ogImage, url).toString(), 'GET')).res.ok; } catch {}
  }
  const previewIssues = [!ogTitle && 'title', !ogDesc && 'description', !ogImage ? 'image' : !imageOk && 'image (broken link)'].filter(Boolean);
  add({ check: 'Social previews', ok: !previewIssues.length, detail: previewIssues.length ? `Missing ${previewIssues.join(', ')}` : 'Title, description and image set', fix: 'Add og:title, og:description and a 1200×630 og:image so shared links look good on X, LinkedIn and WhatsApp.', weight: 12 });

  // 4. Must-have pages + broken links.
  const links = [...new Set((html.match(/href\s*=\s*["']([^"'#]+)["']/gi) ?? [])
    .map((h) => h.replace(/^href\s*=\s*["']/i, '').replace(/["']$/, ''))
    .map((h) => { try { return new URL(h, url); } catch { return null; } })
    .filter((u): u is URL => !!u && u.host === url.host && !/\.(png|jpe?g|svg|webp|ico|css|js|woff2?)$/i.test(u.pathname))
    .map((u) => u.origin + u.pathname))];
  const has = (re: RegExp) => links.some((l) => re.test(new URL(l).pathname)) || re.test(html.slice(0, 200_000).toLowerCase());
  const pages = [['Pricing', /pricing/], ['Terms', /terms/], ['Privacy', /privacy/]] as const;
  const missingPages = pages.filter(([, re]) => !has(re)).map(([n]) => n);
  add({ check: 'Pricing, Terms and Privacy', ok: !missingPages.length, detail: missingPages.length ? `Can’t find: ${missingPages.join(', ')}` : 'All linked', fix: 'Link Pricing, Terms and Privacy from your footer. Payment providers and ad platforms check for them.', weight: 10 });

  const broken: string[] = [];
  for (const l of links.slice(0, 20)) {
    try {
      let { res } = await get(l, 'HEAD');
      if (res.status === 405 || res.status === 403) res = (await get(l, 'GET')).res;
      if (res.status >= 400) broken.push(`${new URL(l).pathname} (${res.status})`);
    } catch { broken.push(`${new URL(l).pathname} (no response)`); }
  }
  add({ check: 'No broken links', ok: !broken.length, detail: broken.length ? broken.slice(0, 5).join(', ') : `Checked ${Math.min(20, links.length)} links`, fix: 'Fix or remove these links. Broken pages on launch day lose signups.', weight: 10 });

  const hasForm = /<form[\s>]/i.test(html) || /type\s*=\s*["']email["']/i.test(html);
  add({ check: 'Signup form', ok: hasForm, detail: hasForm ? 'Found a form on the page' : 'No signup form on the homepage', fix: 'Put a signup or waitlist form on your homepage. ShipItLoud can host one for you.', weight: 8 });

  // 5. Analytics.
  const analytics = /(googletagmanager|gtag\(|plausible\.io|posthog|umami|fathom|vercel\/analytics|_vercel\/insights|clarity\.ms|segment\.com|mixpanel|cloudflareinsights)/i.exec(html)?.[1];
  add({ check: 'Analytics installed', ok: !!analytics, detail: analytics ? `Found ${analytics.replace(/[\\(]/g, '')}` : 'No analytics script found', fix: 'Install analytics (Plausible, PostHog or Google Analytics) so you can see where launch traffic comes from.', weight: 8 });

  // 6. Speed: real Core Web Vitals from Google PageSpeed when available; otherwise response time and page weight.
  let speed: CheckResult | null = null;
  try {
    const ps = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url.toString())}&strategy=mobile&category=performance`, { signal: AbortSignal.timeout(60_000) });
    if (ps.ok) {
      const j = await ps.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { displayValue?: string }> } };
      const score = Math.round((j.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
      const lcp = j.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue;
      speed = { check: 'Page speed (mobile)', ok: score >= 70, detail: `Score ${score}/100${lcp ? `, largest paint ${lcp}` : ''}`, fix: 'Compress images, lazy-load below-the-fold media and cut unused scripts.', weight: 12 };
    }
  } catch {}
  speed ??= { check: 'Page speed', ok: ttfb < 1500 && html.length < 600_000, detail: `First response ${ttfb} ms, page ${Math.round(html.length / 1024)} KB`, fix: 'Your page is slow to respond or very heavy. Use a CDN and compress images.', weight: 12 };
  add(speed);

  const total = results.reduce((s, r) => s + r.weight, 0);
  const score = Math.round((results.filter((r) => r.ok).reduce((s, r) => s + r.weight, 0) / total) * 100);
  await db.from('readiness_checks').insert({ workspace_id: workspaceId, url: url.toString(), score, results });
  return { score, results };
}
