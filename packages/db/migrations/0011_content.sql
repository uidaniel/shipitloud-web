-- Content engine (PRD sections 6, 16, 22): winning format library, product updates that trigger posts,
-- content ideas that group repurposed posts, and where updates come from.

-- ---------------------------------------------------------------- winning formats (also the UGC "viral_formats")
create table if not exists viral_formats (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,
  workspace_id  uuid references workspaces (id) on delete cascade,   -- null = the shared library
  kind          text not null check (kind in ('post','video','carousel')),
  platforms     text[] not null default '{}',
  name          text not null,
  hook_pattern  text not null,
  structure     text not null,
  example       text not null,
  why           text not null,
  best_for      text[] not null default '{}',     -- updates, tips, story, customer, launch, opinion
  needs         text,                             -- what must be true to use it honestly, e.g. "a real number"
  niche         text,
  engagement    jsonb not null default '{}'::jsonb,  -- filled from the workspace's own results over time
  embedding     vector(1024),
  created_at    timestamptz not null default now(),
  unique (slug, workspace_id)
);
create unique index if not exists viral_formats_global_slug on viral_formats (slug) where workspace_id is null;
alter table viral_formats enable row level security;
create policy "library read" on viral_formats for select using (workspace_id is null or is_workspace_owner(workspace_id));

-- ---------------------------------------------------------------- product updates
create table if not exists content_sources (
  workspace_id     uuid primary key references workspaces (id) on delete cascade,
  changelog_url    text,            -- RSS/Atom feed of a changelog or blog
  github_repo      text,            -- owner/name; releases are read from the public API
  webhook_secret   text,            -- for /api/hooks/github/<workspace>; never readable by the app's users
  last_checked_at  timestamptz,
  updated_at       timestamptz not null default now()
);
alter table content_sources enable row level security;
create policy "owner read"   on content_sources for select using (is_workspace_owner(workspace_id));
create policy "owner insert" on content_sources for insert with check (is_workspace_owner(workspace_id));
create policy "owner update" on content_sources for update using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));
revoke select on content_sources from anon, authenticated;
grant select (workspace_id, changelog_url, github_repo, last_checked_at, updated_at) on content_sources to authenticated;

create table if not exists product_updates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  source        text not null check (source in ('github_release','github_push','changelog','manual')),
  external_id   text not null,
  title         text not null,
  body          text,
  url           text,
  published_at  timestamptz,
  used_at       timestamptz,        -- turned into posts
  created_at    timestamptz not null default now(),
  unique (workspace_id, source, external_id)
);
create index if not exists product_updates_ws_idx on product_updates (workspace_id, created_at desc);
alter table product_updates enable row level security;
create policy "owner read"   on product_updates for select using (is_workspace_owner(workspace_id));
create policy "owner insert" on product_updates for insert with check (is_workspace_owner(workspace_id));
create policy "owner delete" on product_updates for delete using (is_workspace_owner(workspace_id));

-- ---------------------------------------------------------------- ideas (one idea, many posts)
create table if not exists content_ideas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  title         text not null,
  pillar        text,
  source        text not null check (source in ('pillar','update','listening','manual','repurpose')),
  source_ref    text,
  format_slug   text,
  week_of       date,
  created_at    timestamptz not null default now()
);
create index if not exists content_ideas_ws_idx on content_ideas (workspace_id, week_of desc);
alter table content_ideas enable row level security;
create policy "owner read" on content_ideas for select using (is_workspace_owner(workspace_id));

-- ---------------------------------------------------------------- the shared library
insert into viral_formats (slug, kind, platforms, name, hook_pattern, structure, example, why, best_for, needs) values
('ship-log', 'post', '{x,linkedin}', 'Ship log', 'Shipped this week: [N] things', 'One line per change, each with who it helps. End with what''s next.', 'Shipped this week:\n- Invoices remember your last client\n- Receipts go out on their own\nNext: deposits.', 'Shows momentum and gives people a reason to come back.', '{updates}', 'real shipped changes'),
('build-in-public-number', 'post', '{x,linkedin}', 'Build-in-public number', 'Week [N] of building [product]: [metric] → [metric]', 'The number, what moved it, what didn''t work, what you''ll try next.', 'Week 6 of building Balans: 40 → 112 waitlist signups. What worked: one honest Reddit reply. What didn''t: posting at night.', 'Specific numbers earn trust and invite people to follow along.', '{story,updates}', 'a real metric'),
('mistake-lesson', 'post', '{x,linkedin}', 'Mistake and lesson', 'I [did X] for [time]. It was a mistake.', 'What you did, what it cost, what you do now, one line others can use.', 'I built for 4 months before talking to a single user. Now I show a rough screen to 5 people before writing code.', 'Honest failure is relatable and teaches something concrete.', '{story,tips}', 'a real experience'),
('before-after', 'post', '{x,linkedin}', 'Before / after', 'Before: [painful way]. After: [new way].', 'Two short blocks. Concrete steps, no adjectives. Close with who it''s for.', 'Before: make an invoice in Word, export a PDF, chase on WhatsApp.\nAfter: type the job in WhatsApp, the client pays from a link.', 'People recognise their own pain in the "before".', '{launch,updates,customer}', null),
('contrarian', 'post', '{x,linkedin}', 'Contrarian take', 'Unpopular opinion: [belief most of your audience holds] is wrong.', 'The claim, your reason from experience, the nuance, a question back.', 'Unpopular opinion: you don''t need a landing page to start. You need 10 people who''ll reply to a DM.', 'Disagreement drives replies; nuance keeps it credible.', '{opinion}', 'a view you actually hold'),
('how-to-steps', 'post', '{x,linkedin}', 'How-to in steps', 'How to [outcome] in [N] steps', 'Numbered steps, one action each, the tool-free version first.', 'How to get paid faster as a freelancer:\n1. Invoice the day you finish\n2. Put the due date in the first line\n3. Follow up on day 3, not day 30', 'Saveable and useful even without the product.', '{tips}', null),
('customer-question', 'post', '{x,linkedin}', 'Customer question answered', 'A user asked: "[real question]"', 'The question, the honest answer, what you changed because of it.', 'A user asked: "Can my client pay without an account?" Yes, they just open the link. We made that the default after this question.', 'Shows you listen; the question is often everyone''s question.', '{customer}', 'a real question'),
('decision', 'post', '{x,linkedin}', 'Behind-the-scenes decision', 'We almost built [X]. Here''s why we didn''t.', 'The option, the trade-off, the deciding fact, what you built instead.', 'We almost added a mobile app. Then we saw every client already lives in WhatsApp.', 'Decisions show taste and make the product feel considered.', '{story}', null),
('myth-reality', 'post', '{x,linkedin}', 'Myth vs reality', 'Myth: [common belief]. Reality: [what you saw].', 'Two to three myth/reality pairs about your audience''s problem.', 'Myth: clients pay late because they''re broke.\nReality: most just forget. A reminder on day 3 fixes it.', 'Corrects a costly belief in the reader''s own world.', '{tips,opinion}', null),
('checklist', 'post', '{x,linkedin}', 'Checklist', 'Before you [task], check these [N] things', 'Short checklist, each item testable in a minute.', 'Before you send an invoice, check: due date, bank details, a line for what it''s for.', 'Easy to save and share.', '{tips}', null),
('honest-question', 'post', '{x,linkedin}', 'Genuine question', 'How do you [handle the problem] today?', 'One real question, why you''re asking, your current answer.', 'How do you remind clients to pay without sounding rude? I send one message on day 3. Curious what works for you.', 'Starts conversations you can learn from.', '{customer,opinion}', null),
('founder-arc', 'post', '{linkedin}', 'Founder story arc', 'A year ago, [situation].', 'Situation, struggle, turning point, lesson, what you''re building now. Short lines.', 'A year ago I chased 6 clients for money in one week. That week became Balans.', 'Stories travel furthest on LinkedIn when they''re specific.', '{story,launch}', 'your real story'),
('pov-meme', 'video', '{instagram,tiktok}', 'POV text over video', 'POV: [relatable founder or customer moment]', 'One line of on-screen text over a short loop or screen recording; caption adds the twist.', 'POV: the app is done and now you have to beg the internet to use it', 'Relatable moments get shared without anyone on camera.', '{story,opinion}', null),
('expectation-reality', 'video', '{instagram,tiktok}', 'Expectation vs reality', 'Expectation: [ideal]. Reality: [what happens].', 'Two beats with on-screen text, the product as the fix in the last beat.', 'Expectation: client pays on time. Reality: "sorry, will send tomorrow" x4.', 'A familiar contrast with a clear payoff.', '{launch,customer}', null),
('screen-15s', 'video', '{instagram,tiktok,x}', 'Watch me do it in 15 seconds', 'Watch me [do the job] in 15 seconds', 'Real screen recording, captions on every step, end on the result.', 'Watch me send an invoice from WhatsApp in 15 seconds', 'Proof beats claims; short and silent-friendly.', '{launch,updates}', 'a real recording'),
('split-vs', 'video', '{instagram,tiktok}', 'X vs Y split', '[Old way] vs [your way]', 'Split screen or two beats, same task, different effort.', 'Invoice in Word vs invoice in WhatsApp', 'Instant visual comparison.', '{launch}', null),
('tell-me-without', 'video', '{instagram,tiktok}', 'Tell me without telling me', 'Tell me you''re a [persona] without telling me you''re a [persona]', 'Text skit with 3 quick beats the audience recognises.', 'Tell me you''re a freelancer without telling me: 14 tabs of unpaid invoices', 'In-jokes build belonging with the niche.', '{opinion,story}', null),
('things-that-make-sense', 'video', '{instagram,tiktok}', 'Things that just make sense', 'Things that just make sense for [persona]', '3-5 quick tips as on-screen text, product as one of them.', 'Things that just make sense for freelancers: invoice the same day; ask for a deposit; let clients pay from a link', 'Listicle pacing holds attention.', '{tips}', null),
('numbered-story', 'carousel', '{instagram,linkedin}', 'Numbered story', '[Bold claim] in 4 slides', 'Slides: proof, strategy, system, product. One idea per slide, big type.', '01 Proof: 112 signups from one thread. 02 Strategy... 03 System... 04 Product...', 'Swipe-through structure rewards finishing.', '{story,tips}', 'a real result'),
('mistakes-carousel', 'carousel', '{instagram,linkedin}', 'Mistakes I made', '[N] mistakes I made [doing X]', 'One mistake per slide with the fix underneath.', '5 mistakes I made invoicing clients', 'Saves and shares; easy to read.', '{tips,story}', null),
('cheat-sheet', 'carousel', '{instagram,linkedin}', 'Cheat sheet', 'The [topic] cheat sheet', 'Dense but scannable reference slides, last slide is the product.', 'The freelancer payment cheat sheet', 'Reference content gets saved and revisited.', '{tips}', null)
on conflict do nothing;
