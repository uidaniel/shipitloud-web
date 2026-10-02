-- 0006: launch kit (PRD days 5-6): 30-day plan, customer waitlist pages, readiness check, directories.

-- ---------------------------------------------------------------- 30-day launch plan
create table if not exists launch_plans (
  workspace_id  uuid primary key references workspaces (id) on delete cascade,
  launch_date   date not null,
  tasks         jsonb not null default '[]'::jsonb,   -- [{id, day, title, why, channel, asset_ref, asset_id, done}]
  status        text not null default 'ready' check (status in ('building','ready','failed')),
  error         text,
  model         text,
  prompt_version text,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- customer waitlist pages
alter table waitlist_pages add column if not exists headline text;
alter table waitlist_pages add column if not exists subhead text;
alter table waitlist_pages add column if not exists cta text not null default 'Join the waitlist';
alter table waitlist_pages add column if not exists theme jsonb not null default '{}'::jsonb;
alter table waitlist_pages add column if not exists show_badge boolean not null default true;
alter table waitlist_pages add column if not exists updated_at timestamptz not null default now();
create unique index if not exists waitlist_pages_one_per_ws on waitlist_pages (workspace_id);

create policy "owner creates page" on waitlist_pages for insert with check (is_workspace_owner(workspace_id));
create policy "owner updates page" on waitlist_pages for update using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

-- Owners can export / delete their own signups (GDPR requests).
create policy "owner deletes signups" on waitlist_signups for delete using (is_workspace_owner(workspace_id));

-- ---------------------------------------------------------------- launch readiness check
create table if not exists readiness_checks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  url           text not null,
  score         integer not null,
  results       jsonb not null,     -- [{check, ok, detail, fix}]
  checked_at    timestamptz not null default now()
);
create index if not exists readiness_ws_idx on readiness_checks (workspace_id, checked_at desc);

-- ---------------------------------------------------------------- directories
create table if not exists directories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  url           text not null,
  submit_url    text,
  category      text not null check (category in ('startup','saas','ai','dev','launch')),
  submit_method text not null default 'manual' check (submit_method in ('api','form','manual')),
  notes         text
);

create table if not exists directory_submissions (
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  directory_id  uuid not null references directories (id) on delete cascade,
  status        text not null default 'todo' check (status in ('todo','drafted','submitted','live','rejected')),
  listing_url   text,
  submitted_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, directory_id)
);

alter table launch_plans enable row level security;
alter table readiness_checks enable row level security;
alter table directories enable row level security;
alter table directory_submissions enable row level security;
create policy "owner all launch_plans" on launch_plans for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));
create policy "owner reads readiness" on readiness_checks for select using (is_workspace_owner(workspace_id));
create policy "anyone reads directories" on directories for select using (true);
create policy "owner all submissions" on directory_submissions for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

-- Starter list of places founders actually submit to. Maintained by us; more added over time.
insert into directories (name, url, submit_url, category, submit_method, notes) values
  ('Product Hunt', 'https://www.producthunt.com', 'https://www.producthunt.com/posts/new', 'launch', 'manual', 'Launch at 12:01am PT. Prep gallery, tagline, first comment.'),
  ('Hacker News (Show HN)', 'https://news.ycombinator.com', 'https://news.ycombinator.com/submit', 'launch', 'manual', 'Title starts with "Show HN:". Be there to answer comments.'),
  ('Indie Hackers', 'https://www.indiehackers.com', 'https://www.indiehackers.com/products/new', 'startup', 'form', 'Add the product, then post a milestone.'),
  ('BetaList', 'https://betalist.com', 'https://betalist.com/submit', 'startup', 'form', 'For pre-launch products. Free queue is slow; paid is faster.'),
  ('Uneed', 'https://www.uneed.best', 'https://www.uneed.best/submit-a-tool', 'launch', 'form', 'Daily launches with a free queue.'),
  ('Peerlist Launchpad', 'https://peerlist.io/launchpad', 'https://peerlist.io/launchpad', 'launch', 'form', 'Weekly launches, maker-friendly.'),
  ('DevHunt', 'https://devhunt.org', 'https://devhunt.org/submit', 'dev', 'form', 'For developer tools.'),
  ('Microlaunch', 'https://microlaunch.net', 'https://microlaunch.net/submit', 'launch', 'form', 'Month-long launch rounds.'),
  ('SaaSHub', 'https://www.saashub.com', 'https://www.saashub.com/submit', 'saas', 'form', 'Listed as an alternative to competitors.'),
  ('AlternativeTo', 'https://alternativeto.net', 'https://alternativeto.net/software/new/', 'saas', 'form', 'List against the tools people already use.'),
  ('There''s An AI For That', 'https://theresanaiforthat.com', 'https://theresanaiforthat.com/submit/', 'ai', 'form', 'For AI products. Paid listing.'),
  ('Futurepedia', 'https://www.futurepedia.io', 'https://www.futurepedia.io/submit-tool', 'ai', 'form', 'For AI products.'),
  ('Fazier', 'https://fazier.com', 'https://fazier.com/submit', 'launch', 'form', 'Launch platform with free option.'),
  ('Startup Stash', 'https://startupstash.com', 'https://startupstash.com/add-listing/', 'startup', 'form', 'Curated startup tool directory.'),
  ('Tiny Startups', 'https://www.tinystartups.com', 'https://www.tinystartups.com/submit', 'startup', 'form', 'For small, indie products.'),
  ('Launching Next', 'https://www.launchingnext.com', 'https://www.launchingnext.com/submit/', 'startup', 'form', 'Free startup listing.'),
  ('Reddit r/SideProject', 'https://www.reddit.com/r/SideProject', 'https://www.reddit.com/r/SideProject/submit', 'launch', 'manual', 'Share the story, not just the link. Read the rules first.'),
  ('Twitter/X Build in Public', 'https://x.com', 'https://x.com/compose/post', 'launch', 'manual', 'Post the launch thread with #buildinpublic.')
on conflict (name) do nothing;
