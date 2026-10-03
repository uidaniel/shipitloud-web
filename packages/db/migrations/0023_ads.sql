-- Ads autopilot (PRD section 6 "Autonomous ads", section 14): Meta first, then Google. The founder sets caps, regions
-- and the goal and approves the first creatives; the AI may pause losers, move budget to winners and refresh
-- creatives, only inside the caps. Every autonomous action is written to ad_events with its reason.

create table if not exists ad_campaigns (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces (id) on delete cascade,
  platform         text not null check (platform in ('meta','google')),
  name             text not null,
  goal             text not null check (goal in ('signups','traffic','installs')),
  landing_url      text not null,
  regions          text[] not null default '{}',          -- ISO country codes; only the founder changes these
  daily_cap_cents  integer not null check (daily_cap_cents >= 100),
  total_cap_cents  integer not null check (total_cap_cents >= daily_cap_cents),
  spent_cents      integer not null default 0,            -- lifetime, from platform reports
  spent_today_cents integer not null default 0,
  mode             text not null check (mode in ('test','autopilot')),
  status           text not null default 'drafting' check (status in ('drafting','ready','active','paused','capped','ended','failed')),
  pause_reason     text,
  special_category text,                                   -- credit, employment, housing, social_issues (Meta restricts targeting)
  external_id      text,                                   -- platform campaign id
  external_adset_id text,
  simulated        boolean not null default true,          -- test mode: no real platform, no real money
  approved_at      timestamptz,                            -- the founder said "launch"
  launched_at      timestamptz,
  last_synced_at   timestamptz,
  last_optimized_at timestamptz,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ad_campaigns_ws_idx on ad_campaigns (workspace_id, created_at desc);
alter table ad_campaigns enable row level security;
create policy "owner read" on ad_campaigns for select using (is_workspace_owner(workspace_id));

create table if not exists ads (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces (id) on delete cascade,
  campaign_id        uuid not null references ad_campaigns (id) on delete cascade,
  asset_id           uuid references assets (id) on delete set null,   -- the ad_creative the founder approved
  external_id        text,
  status             text not null default 'waiting' check (status in ('waiting','active','paused','rejected','retired')),
  pause_reason       text,
  budget_cents       integer not null default 0,           -- this ad's share of the daily cap
  impressions        integer not null default 0,
  clicks             integer not null default 0,
  conversions        integer not null default 0,
  spend_cents        integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (campaign_id, asset_id)
);
create index if not exists ads_campaign_idx on ads (campaign_id);
alter table ads enable row level security;
create policy "owner read" on ads for select using (is_workspace_owner(workspace_id));

create table if not exists ad_daily (
  ad_id        uuid not null references ads (id) on delete cascade,
  day          date not null,
  impressions  integer not null default 0,
  clicks       integer not null default 0,
  conversions  integer not null default 0,
  spend_cents  integer not null default 0,
  primary key (ad_id, day)
);
alter table ad_daily enable row level security;
create policy "owner read" on ad_daily for select using (exists (select 1 from ads a where a.id = ad_id and is_workspace_owner(a.workspace_id)));

create table if not exists ad_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  campaign_id  uuid not null references ad_campaigns (id) on delete cascade,
  ad_id        uuid references ads (id) on delete set null,
  action       text not null check (action in ('create','launch','pause','resume','shift_budget','refresh','cap_reached','anomaly','kill','policy_block','sync_error','end')),
  actor        text not null default 'ai' check (actor in ('ai','founder','system')),
  reason       text not null,
  amount_cents integer,
  created_at   timestamptz not null default now()
);
create index if not exists ad_events_campaign_idx on ad_events (campaign_id, created_at desc);
alter table ad_events enable row level security;
create policy "owner read" on ad_events for select using (is_workspace_owner(workspace_id));

-- Meta pixel + Conversions API settings (server-side events, consented only).
create table if not exists ad_settings (
  workspace_id    uuid primary key references workspaces (id) on delete cascade,
  meta_pixel_id   text,
  meta_ad_account text,                -- act_123...
  google_customer text,                -- 123-456-7890
  updated_at      timestamptz not null default now()
);
alter table ad_settings enable row level security;
create policy "owner all" on ad_settings for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));
