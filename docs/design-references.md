# Design references

Captured 2026-10-02 with Playwright (desktop 1440×900, mobile 390×844). Screenshots live in
`docs/design-references/screens/` as `<site>-<desktop|mobile>-<hero|full>.png`.
All 11 sites opened. lovable.dev and raycast.com desktop needed a second attempt (Cloudflare check / slow animation); both captured.

Re-read this file before building any screen, and list the references each screen uses in its PR/notes.

## spacefs.com (primary type reference)
- Hero: two-line headline, line 1 ink, line 2 the same size in mid gray — the gray line carries the "what", the ink line the hook.
- Very tight tracking on a large Geist-style grotesk; subhead is short, gray, centered, max ~45ch.
- One dark pill button, a tiny gray meta line under it ("macOS · Linux · Windows coming soon").
- Feature rows: tiny mono number (01–05) at left, medium-weight title, gray description pushed to the right column, thin 1px dividers between rows. No icons, no cards.
- Soft light-gray page background (#F0F1F3-ish), white only for floating pills/cards.
- Mobile: same structure, headline wraps to 2–3 lines, nothing removed except the nav (collapses to a round menu button).

## linear.app
- Dark UI with near-black surface, product UI screenshot is the hero, sitting right under a left-aligned headline.
- Section pattern: big two-line title on the left, short gray paragraph on the right, then a product shot.
- Small gray "Features" link list under each section instead of cards.
- Calm: no loud color at all; hierarchy comes from gray levels only.

## vercel.com
- Huge, short headline ("Agentic Infrastructure"), left aligned, one black pill + one ghost button.
- Logo strip in grayscale directly under the hero.
- Black-and-white restraint; color appears only in tiny accents inside product shots.
- Lots of empty space between sections — sections breathe ~160px+.

## raycast.com
- Bold dark hero, big bold centered headline, one light button with a mono meta line underneath ("Windows 10+ (x64 or ARM64)").
- Nav is a floating rounded bar with a subtle border on dark.
- Takeaway for us: mono meta text under the primary button; dark hero confidence. (We skip the glow art — gradient blobs are banned.)

## resend.com
- Extreme minimalism: badge, two-line headline, two-line gray subhead, one primary + one text button. Nothing else above the fold.
- Black background, white type, single soft light streak.
- Takeaway: one line of value, one button.

## cursor.com
- Product-first: short two-line headline top-left, two buttons, then a huge product window immediately below, above the fold.
- Product window shows real-looking task lists and states ("In progress", "Ready for review") — a believable working app, not an illustration.
- Warm off-white background (#F7F7F4), dark pill buttons.

## cal.com
- Light UI on an off-white page with white rounded "cards" holding sections.
- "How it works": three numbered cards (01, 02, 03) each with a small UI vignette.
- Friendly pricing/plan cards, Google sign-up as primary CTA, "No credit card required" meta line.
- Takeaway: simple, honest pricing layout with a meta line under the CTA.

## dub.co
- Centered headline, gray subhead, black primary + white secondary button.
- Faint grid lines in the background; product dashboard framed directly under the hero with tabs to switch views.
- Testimonials are single large quotes with a small logo + face, placed between feature sections.
- Mono numbers for live stats ("LINKS CREATED 205,063,130").

## lovable.dev
- One big input box is the hero CTA ("Ask Lovable to create a…"), centered under a short headline.
- Header has just logo, a few links, Log in + Get started.
- Takeaway for us: "Paste your product URL" input *is* the CTA. (Skip their gradient — banned for us.)

## gumroad.com
- Loud and confident: heavy black outlines, flat bold color, black blocky buttons with square corners.
- Huge plain headline ("Go from 0 to $1") with a one-sentence subhead.
- Takeaway: where we want "loud" energy (lime moments, posters), use flat color blocks with hard edges, not glows.

## attio.com
- Clean light dashboard UI: dense tables with small type, thin borders, colored score chips (ICP score) in a column.
- Hero: big tight headline, two-line gray subhead, two small buttons, product window below.
- Sections alternate short copy + dense real UI; tables, not cards, for data.
- Takeaway for the approval inbox / dashboards: table rows, small status chips, one primary action.

## Principles we take (summary)
1. One input as CTA (lovable) + one button (resend).
2. Two-tone headline: ink line + gray line (spacefs).
3. Mono step numbers with thin dividers for "how it works" (spacefs, cal).
4. Product UI right under the hero, above the fold on desktop (cursor, linear, attio).
5. Mono meta line under primary actions and for stats (raycast, dub).
6. Data in tables with small chips (attio).
7. Flat color blocks for loud moments, never glows or blobs (gumroad).
8. Big empty space between sections; max width ~1200px (vercel).

## solecapsule.com (added 2026-10-02, founder request)
- Pure-black canvas with soft, glowing particles floating at different depths: space feels like a volume you're inside, not a flat backdrop.
- Takeaway: our WebGL scene (fly-through stars, spiral galaxy, near-camera dust) on the landing and pricing pages.
