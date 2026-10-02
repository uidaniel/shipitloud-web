# ShipItLoud

You built it. Ship it loud. The product spec is `ShipItLoud — Product Requirements Document.pdf`; where code and PRD disagree, the PRD wins.

## Layout

```
apps/web          Next.js 16 site: landing, waitlist + referrals, pricing, Terms/Privacy/Refund
packages/db       SQL migrations (Supabase) and row types
docs/             design-references.md (+ screenshots) — read before any design work
```

Coming next (PRD days 1–2): `apps/worker`, `apps/extension`, `packages/ai`, `packages/templates`.

## Run it

```sh
npm install
npm run dev          # http://localhost:3000
npm test             # waitlist rules (positions, referrals, fraud checks)
npm run build
```

Without Supabase env vars the waitlist writes to `apps/web/.data/waitlist.json` (dev only; it won't persist on Vercel).

## Going live (Day 0)

1. Create a Supabase project. Run `packages/db/migrations/0001_waitlist.sql` in the SQL editor.
2. Deploy `apps/web` to Vercel (root directory `apps/web`) with:
   - `NEXT_PUBLIC_SITE_URL=https://shipitloud.com`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `IP_HASH_SALT` (long random string)
3. Point shipitloud.com at Vercel.
4. Then apply: Dodo Payments (under MOTX Studios), Meta, Google Ads, LinkedIn, WhatsApp.

## Before launch

- Legal pages (`/terms`, `/privacy`, `/refund`) are working drafts. Get the US/UK lawyer review the PRD calls for, and add governing law and MOTX Studios' registered address.
- `site.contactEmail` (`apps/web/lib/site.ts`) is `hello@shipitloud.com`; that inbox has to exist.
- The waitlist rate limit is per server instance; move it to Postgres/KV when traffic grows.
