import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import path from 'node:path';

// Server-side fetches: give each IPv4/IPv6 connection attempt 3s instead of 250ms (slow links without IPv6).
setDefaultAutoSelectFamilyAttemptTimeout(3000);

// Monorepo: secrets live in the repo-root .env.local, shared by web and worker.
// (@next/env caches its first load, so read the root file directly; real env vars win.)
for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(path.resolve(process.cwd(), '../..', file), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.trim();
    }
  } catch {}
}

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  // Inline the public values so every runtime (browser, proxy) sees them.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? '',
    NEXT_PUBLIC_AUTH_GOOGLE: process.env.NEXT_PUBLIC_AUTH_GOOGLE ?? '',
  },
  transpilePackages: ['@shipitloud/db', '@shipitloud/templates', '@shipitloud/engine', '@shipitloud/ai'],
  // Screenshot uploads for the demo video go through a server action.
  experimental: { serverActions: { bodySizeLimit: '26mb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
