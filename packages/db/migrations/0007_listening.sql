-- Listening (PRD section 6, 17): what to listen for, what was found, and Reddit smart search links.
-- Sources poll from the worker (HN, Bluesky, GitHub, RSS, Product Hunt and X when configured).
-- Reddit is never read by our servers: the founder's browser does that through the extension.

create table if not exists listen_configs (
  workspace_id    uuid primary key references workspaces (id) on delete cascade,
  active          boolean not null default false,
  keywords        text[] not null default '{}',   -- pain phrases and "what it does" phrases
  competitors     text[] not null default '{}',   -- also searched as "alternative to X"
  exclude         text[] not null default '{}',   -- drop any post containing these
  sources         text[] not null default '{hn,bluesky}',
  rss_feeds       text[] not null default '{}',
  threshold       integer not null default 60 check (threshold between 0 and 100),
  last_polled_at  timestamptz,
  backfilled_at   timestamptz,
  updated_at      timestamptz not null default now()
);
alter table listen_configs enable row level security;
create policy "owner read"   on listen_configs for select using (is_workspace_owner(workspace_id));
create policy "owner insert" on listen_configs for insert with check (is_workspace_owner(workspace_id));
create policy "owner update" on listen_configs for update using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

create table if not exists mentions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces (id) on delete cascade,
  source           text not null check (source in ('hn','bluesky','x','indiehackers','producthunt','github','rss','reddit_extension')),
  external_id      text not null,
  url              text not null,
  author           text,
  title            text,
  text             text not null,
  posted_at        timestamptz,
  matched          text,                     -- the keyword that found it
  heuristic_score  integer not null default 0,
  relevance_score  integer,                  -- AI score 0-100; null until scored
  intent           text check (intent in ('asking_for_tool','complaint','competitor_mention','discussion','other')),
  reason           text,
  draft_asset_id   uuid references assets (id) on delete set null,
  status           text not null default 'new' check (status in ('new','drafted','replied','dismissed')),
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  unique (workspace_id, source, external_id)
);
create index if not exists mentions_feed_idx on mentions (workspace_id, status, created_at desc);
alter table mentions enable row level security;
create policy "owner read"   on mentions for select using (is_workspace_owner(workspace_id));
create policy "owner update" on mentions for update using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

create table if not exists reddit_searches (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces (id) on delete cascade,
  subreddit       text,
  query           text not null,
  search_url      text not null,
  last_opened_at  timestamptz,
  created_at      timestamptz not null default now(),
  unique (workspace_id, search_url)
);
alter table reddit_searches enable row level security;
create policy "owner all" on reddit_searches for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));
create index if not exists ai_calls_ws_purpose_idx on ai_calls (workspace_id, purpose, created_at);
