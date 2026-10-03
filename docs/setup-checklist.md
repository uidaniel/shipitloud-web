# Setup checklist (do at the end)

Everything below is already built in code. Each item is a dashboard setting, account or key that switches it on. Until then, the feature hides itself or falls back to copy-and-post.

## Domain and email
- [ ] Buy `shipitloud.com`. Point `app.shipitloud.com` at the web app and set `NEXT_PUBLIC_SITE_URL`.
- [ ] Resend: verify the domain and set `RESEND_API_KEY` and `EMAIL_FROM`.
- [ ] Supabase → Authentication → SMTP: use Resend. The built-in mailer only sends a few emails an hour, which is not enough for real signups.
- [ ] Waitlist emails: set `ACTIONS_MODE=live` to really send. Until then every email is recorded as "simulated" and nothing leaves. Set `UNSUBSCRIBE_SECRET` and keep it stable, or old unsubscribe links stop working.
- [ ] Founders' own sending domains (send as hello@theirproduct.com): add them through the Resend Domains API and set `email_settings.domain_verified`. Until then mail goes out as "Product via ShipItLoud".

## Supabase Auth (Authentication → URL configuration)
- [ ] Site URL: the production app URL.
- [ ] Redirect URLs: `https://<app>/auth/callback`, `https://<app>/auth/confirm`, and `http://localhost:3001/**` for development.
- [ ] Email templates: change links to the token-hash form so they work in any browser:
  - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/app/new`
  - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
  - Magic link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`
- [ ] Optional: Authentication → Policies → turn on leaked-password protection. The app already shows a clear message when a password is rejected.

## Google sign-in
- [ ] Google Cloud: create an OAuth client (web). The redirect URI is `https://<project>.supabase.co/auth/v1/callback`.
- [ ] Supabase → Authentication → Providers → Google: paste the client ID and secret.
- [ ] Set `NEXT_PUBLIC_AUTH_GOOGLE=1`. The "Continue with Google" buttons appear.

## Listening sources
- [ ] `GITHUB_TOKEN` (fine-grained, public read only). It lifts the search rate limit from 10 to 30 a minute.
- [ ] `PRODUCTHUNT_TOKEN` (Product Hunt developer token). It switches on the Product Hunt source.
- [ ] `X_BEARER_TOKEN`. It switches on X for Scale workspaces, metered by `x_reads`.

## Blog
- [ ] Google Search Console: verify the domain and submit `/sitemap.xml`. Each blog also has `/blog/<slug>/sitemap.xml`.
- [ ] Ranking data: connect the Search Console API to fill `blog_posts.rank` (planned with the analytics work).
- [ ] Custom domains (blog.yourproduct.com): add the domain on Netlify and point a CNAME at it; `blogs.custom_domain` maps it to the right blog.

## Short video (UGC)
- [ ] `PEXELS_API_KEY` (free at pexels.com/api): turns on stock B-roll in videos. Each clip's licence and attribution are recorded automatically.
- [ ] Instagram, TikTok and YouTube publishing APIs (Meta app review, TikTok content posting audit, YouTube Data API). Until approved, videos are copy-and-post with downloads.

## Chrome extension
- [ ] Build it: `npm run build -w @shipitloud/extension`, which writes `apps/extension/dist`. For local testing against `localhost:3001`, use `build:dev`, then chrome://extensions → Developer mode → Load unpacked.
- [ ] If the app's production URL changes, update `DEFAULT_API` / `host_permissions` in `apps/extension/build.mjs`.
- [ ] Chrome Web Store: a developer account ($5 one-time), then upload a zip of `dist/` with the screenshots, the privacy policy URL, and the permission justifications: `storage` holds the connection code, and the host access reads Reddit pages the user opens and calls the ShipItLoud API.
- [ ] PRD section 17: get a legal review of the extension approach against Reddit's terms before launch.

## Worker host (VM, Railway or Fly: undecided)
- [ ] Node 22, then `npm ci`, then `npx playwright install --with-deps chromium`. Remotion downloads its own headless Chrome on first render.
- [ ] Copy the env vars from `.env.example`. Run `npm start -w @shipitloud/worker` under a process manager.
- [ ] At least 2 GB RAM for video rendering.

## App links (App Store and Google Play)
- [ ] Apple: nothing to set up. Listings come from Apple's public iTunes Lookup and Search APIs; reviews from the public review feed, or the app's public page when the feed is empty.
- [ ] Install attribution on iOS: add the founder's App Store Connect provider token (`pt`) so campaign links (`ct=<channel>`) show up in App Store Connect's App Analytics.
- [ ] Google Play: there is no official public listing API. Today we read only the public listing page's basic metadata (name, description, icon, rating), no reviews. Before reading Play reviews, choose a licensed data provider (or confirm Google's terms allow it) and wire it into `apps/worker/src/appstore.ts`.
- [ ] App analytics (P1): App Store Connect and Firebase connections so installs are attributed to channels instead of estimated.

## Billing (Dodo Payments)
- [ ] Until `DODO_API_KEY` is set, billing runs on a test-mode simulator in development: checkout is a pretend page and the Billing page has buttons to simulate a charge, a failed card and a renewal. In production it is off unless `BILLING_SIMULATOR=1` (never set that on the live site).
- [ ] Dodo account (merchant of record, under MOTX Studios). Create three products: Grow ($49/month subscription with a 7-day trial and "Start the trial without a card" unchecked), Scale ($149/month), Launch Pass ($199 one-time).
- [ ] Env: `DODO_API_KEY`, `DODO_WEBHOOK_SECRET` (whsec_…), `DODO_PRODUCT_GROW`, `DODO_PRODUCT_SCALE`, `DODO_PRODUCT_LAUNCH_PASS`, and `DODO_MODE=live` only when going live (test mode otherwise). The worker needs `DODO_API_KEY` and `DODO_MODE` too (dunning, pause resume).
- [ ] Webhook endpoint in Dodo: `https://<app>/api/billing/webhook`, subscribed to all `subscription.*` and `payment.*` events.
- [ ] Turn on Dodo's customer portal (card and invoices) and dunning retries over 7 days.
- [ ] Before launch, in Dodo test mode: start a trial, let it convert, fail a card, pause, resume and cancel, and check each lands on the right plan.
