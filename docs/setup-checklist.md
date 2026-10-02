# Setup checklist (do at the end)

Everything below is already built in code. Each item is a dashboard setting, account or key that switches it on. Until then, the feature hides itself or falls back to copy-and-post.

## Domain and email
- [ ] Buy `shipitloud.com`. Point `app.shipitloud.com` at the web app and set `NEXT_PUBLIC_SITE_URL`.
- [ ] Resend: verify the domain and set `RESEND_API_KEY` and `EMAIL_FROM`.
- [ ] Supabase → Authentication → SMTP: use Resend. The built-in mailer only sends a few emails an hour, which is not enough for real signups.

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

## Worker host (VM, Railway or Fly: undecided)
- [ ] Node 22, then `npm ci`, then `npx playwright install --with-deps chromium`. Remotion downloads its own headless Chrome on first render.
- [ ] Copy the env vars from `.env.example`. Run `npm start -w @shipitloud/worker` under a process manager.
- [ ] At least 2 GB RAM for video rendering.
