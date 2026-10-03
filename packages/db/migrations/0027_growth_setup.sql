-- PRD section 23: growth analysis and the 10-minute setup. Paste a URL; we understand the product, show a tailored
-- growth analysis, pick channels for this product type, and have the first week ready for approval.

create table if not exists growth_analyses (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces (id) on delete cascade,
  url              text,
  status           text not null default 'running' check (status in ('running','ready','failed')),
  error            text,
  product_type     text check (product_type in ('b2b_saas','consumer_app','dev_tool','marketplace','ecommerce','other')),
  stage            text check (stage in ('pre_launch','just_launched','growing')),
  pricing_model    text,
  summary          text,
  problem          text,
  ideal_customer   text,
  hangouts         text[] not null default '{}',     -- where the ideal customer spends time
  positioning      text,
  page_fixes       jsonb not null default '[]'::jsonb,  -- [{ area, fix, why }]
  competitor_gaps  jsonb not null default '[]'::jsonb,  -- [{ competitor, how_they_market, gap }]
  presence         jsonb not null default '{}'::jsonb,  -- socials, blog, reviews, app store, analytics
  growth_score     integer,
  score_parts      jsonb not null default '[]'::jsonb,
  opportunities    jsonb not null default '[]'::jsonb,  -- [{ title, why }] the 3 biggest
  model            text,
  prompt_version   text,
  seconds          integer,                              -- how long understanding + analysis took
  created_at       timestamptz not null default now()
);
create index if not exists growth_analyses_ws_idx on growth_analyses (workspace_id, created_at desc);
alter table growth_analyses enable row level security;
create policy "owner read" on growth_analyses for select using (is_workspace_owner(workspace_id));

create table if not exists channel_plans (
  workspace_id   uuid primary key references workspaces (id) on delete cascade,
  playbook_type  text not null,
  channels       jsonb not null default '[]'::jsonb,    -- [{ id, name, rank, reason, enabled, role: lead|support, connect }]
  accepted_at    timestamptz,
  updated_at     timestamptz not null default now()
);
alter table channel_plans enable row level security;
create policy "owner read" on channel_plans for select using (is_workspace_owner(workspace_id));
create policy "owner update" on channel_plans for update using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

-- How long setup takes, step by step (acceptance: 10 minutes or less of founder time).
create table if not exists setup_progress (
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  step          text not null check (step in ('paste','understand','summary','analysis','channels','connect','wins','live')),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  primary key (workspace_id, step)
);
alter table setup_progress enable row level security;
create policy "owner read" on setup_progress for select using (is_workspace_owner(workspace_id));

-- The free mini analysis on the landing page (lead magnet): no account, one per email and per domain.
create table if not exists free_analyses (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  email_normalized   text not null,
  url                text not null,
  domain             text not null,
  fit                text check (fit in ('launching_soon','already_live','exploring')),
  consent            boolean not null default false,
  status             text not null default 'running' check (status in ('running','ready','failed')),
  error              text,
  results            jsonb not null default '{}'::jsonb,   -- summary, positioning, page_fixes[3], channels[]
  ip_hash            text,
  converted_to_plan  text,
  workspace_id       uuid references workspaces (id) on delete set null,
  created_at         timestamptz not null default now(),
  finished_at        timestamptz
);
create unique index if not exists free_analyses_email_uq on free_analyses (email_normalized);
create unique index if not exists free_analyses_domain_uq on free_analyses (domain);
alter table free_analyses enable row level security;   -- server only (service role); results shown by unguessable id
