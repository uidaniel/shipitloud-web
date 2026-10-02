-- Sales and conversion (PRD section 6): signup-to-paid emails, onboarding nudges for users who didn't activate,
-- churn alerts with win-back drafts. These are the founder's own users, sent in by their snippet (an opaque user
-- id and events, nothing personal) or by their server with a secret API key (email, plan, trial, paid).

-- Secret keys for the server API. Only a hash is stored; the key is shown once.
create table if not exists api_keys (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  prefix        text not null,                 -- first characters, to tell keys apart in the UI
  hash          text not null unique,          -- sha256 of the key
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists api_keys_ws_idx on api_keys (workspace_id);
alter table api_keys enable row level security;
create policy "owner read" on api_keys for select using (is_workspace_owner(workspace_id));
create policy "owner update" on api_keys for update using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

create table if not exists end_users (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces (id) on delete cascade,
  external_id      text not null,               -- the founder's own user id
  email            text,
  name             text,
  plan             text,
  status           text not null default 'free' check (status in ('trial','free','paid','churned')),
  trial_ends_at    timestamptz,
  signed_up_at     timestamptz not null default now(),
  activated_at     timestamptz,
  paid_at          timestamptz,
  churned_at       timestamptz,
  last_seen_at     timestamptz,
  at_risk_at       timestamptz,                 -- set when a paying user's activity falls; cleared when it recovers
  unsubscribed_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id, external_id)
);
create index if not exists end_users_ws_idx on end_users (workspace_id, signed_up_at desc);
alter table end_users enable row level security;
create policy "owner read" on end_users for select using (is_workspace_owner(workspace_id));

create table if not exists user_events (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  end_user_id  uuid not null references end_users (id) on delete cascade,
  event        text not null,
  created_at   timestamptz not null default now()
);
create index if not exists user_events_user_idx on user_events (end_user_id, created_at desc);
create index if not exists user_events_ws_idx on user_events (workspace_id, created_at desc);
alter table user_events enable row level security;
create policy "owner read" on user_events for select using (is_workspace_owner(workspace_id));

create table if not exists lifecycle_settings (
  workspace_id      uuid primary key references workspaces (id) on delete cascade,
  emails_on         boolean not null default false,
  activation_event  text not null default 'activated',   -- the event that means "got value"
  upgrade_url       text,                                -- where upgrade buttons go (pricing or billing page)
  churn_alerts      boolean not null default true,
  last_churn_check  timestamptz,
  updated_at        timestamptz not null default now()
);
alter table lifecycle_settings enable row level security;
create policy "owner all" on lifecycle_settings for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

-- Each lifecycle email reaches each user at most once.
create table if not exists lifecycle_sends (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  asset_id     uuid not null references assets (id) on delete cascade,
  end_user_id  uuid not null references end_users (id) on delete cascade,
  kind         text not null,
  status       text not null check (status in ('sent','simulated','failed')),
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now(),
  unique (asset_id, end_user_id)
);
create index if not exists lifecycle_sends_ws_idx on lifecycle_sends (workspace_id, created_at desc);
alter table lifecycle_sends enable row level security;
create policy "owner read" on lifecycle_sends for select using (is_workspace_owner(workspace_id));

-- Activity per paying user: events in the last 14 days and the 14 before, for churn alerts.
create or replace function user_activity(p_ws uuid)
returns table (end_user_id uuid, recent integer, previous integer, last_event timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id,
    (select count(*)::int from user_events e where e.end_user_id = u.id and e.created_at >= now() - interval '14 days'),
    (select count(*)::int from user_events e where e.end_user_id = u.id and e.created_at >= now() - interval '28 days' and e.created_at < now() - interval '14 days'),
    (select max(e.created_at) from user_events e where e.end_user_id = u.id)
  from end_users u
  where u.workspace_id = p_ws and u.status = 'paid'
    and (is_workspace_owner(p_ws) or auth.role() = 'service_role');
$$;
