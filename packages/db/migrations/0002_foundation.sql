-- 0002: foundation (PRD days 1-2).
-- Profiles, workspace settings, brand tables, connections, assets + approvals,
-- the actions audit log, the job queue, usage metering, notifications.
-- Rule: every table carries workspace_id (or is the user's own row) and has RLS on.
-- The worker uses the service role key, which bypasses RLS; the app uses the user's session.

create extension if not exists vector;

-- ---------------------------------------------------------------- profiles
create table if not exists profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text not null,
  name               text,
  timezone           text not null default 'UTC',
  notification_prefs jsonb not null default '{"email": true, "push": false, "slack": false, "whatsapp": false}'::jsonb,
  created_at         timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own profile read"   on profiles for select using (id = auth.uid());
create policy "own profile update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- workspaces
alter table workspaces add column if not exists trust_threshold integer not null default 85
  check (trust_threshold between 50 and 100);
alter table workspaces add column if not exists kill_switch boolean not null default false;
alter table workspaces add column if not exists trust_dropped_at timestamptz;
alter table workspaces add column if not exists trust_dropped_reason text;
alter table workspaces add column if not exists launch_date date;

-- Ownership check used by every policy. security definer avoids RLS recursion on workspaces.
create or replace function is_workspace_owner(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspaces w where w.id = ws and w.owner_id = auth.uid());
$$;

create policy "owner creates workspace" on workspaces
  for insert with check (owner_id = auth.uid());
create policy "owner updates workspace" on workspaces
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner deletes workspace" on workspaces
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------- brand
create table if not exists brand_brains (
  workspace_id     uuid primary key references workspaces (id) on delete cascade,
  summary          text,
  target_customer  text,
  pain_points      text[] not null default '{}',
  keywords         text[] not null default '{}',
  competitors      text[] not null default '{}',
  content_pillars  text[] not null default '{}',
  embedding        vector(1024),
  confirmed_at     timestamptz,
  updated_at       timestamptz not null default now()
);

create table if not exists voice_profiles (
  workspace_id  uuid primary key references workspaces (id) on delete cascade,
  sample_posts  text[] not null default '{}',
  style_notes   text,
  embedding     vector(1024),
  updated_at    timestamptz not null default now()
);

create table if not exists brand_kits (
  workspace_id  uuid primary key references workspaces (id) on delete cascade,
  logo_url      text,
  palette       text[] not null default '{}',
  fonts         text[] not null default '{}',
  screenshots   text[] not null default '{}',
  confirmed_at  timestamptz,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- connections
create table if not exists connections (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces (id) on delete cascade,
  provider         text not null check (provider in ('x','linkedin','meta','google','github','slack','whatsapp','bluesky','reddit','instagram','tiktok')),
  encrypted_token  text,              -- AES-256-GCM, key in TOKEN_ENCRYPTION_KEY; never sent to the browser
  scopes           text[] not null default '{}',
  account_label    text,
  expires_at       timestamptz,
  status           text not null default 'active' check (status in ('active','expired','revoked','warned','restricted')),
  created_at       timestamptz not null default now(),
  unique (workspace_id, provider)
);

-- ---------------------------------------------------------------- assets + approvals
create table if not exists assets (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces (id) on delete cascade,
  type             text not null check (type in ('poster','video','post','article','email','ad_creative','reply')),
  platform         text,              -- x, linkedin, reddit, hn, instagram, tiktok, email, ...
  title            text not null,
  content          jsonb not null default '{}'::jsonb,
  file_url         text,
  template_id      text,
  status           text not null default 'pending'
                   check (status in ('draft','pending','approved','auto_approved','rejected','scheduled','published','failed','expired')),
  qa_score         integer check (qa_score between 0 and 100),
  publish_score    integer check (publish_score between 0 and 100),
  confidence       integer check (confidence between 0 and 100),
  flags            text[] not null default '{}',   -- policy / QA flags; any flag blocks auto-approval
  scheduled_for    timestamptz,
  expires_at       timestamptz,
  undo_until       timestamptz,
  prompt_version   text,
  model            text,
  idempotency_key  text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists assets_inbox_idx on assets (workspace_id, status, created_at desc);

create table if not exists approvals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  asset_id      uuid not null references assets (id) on delete cascade,
  status        text not null check (status in ('approved','rejected','edited','auto_approved','undone')),
  decided_by    uuid references auth.users (id) on delete set null,
  decided_at    timestamptz not null default now(),
  channel       text not null default 'web' check (channel in ('web','email','slack','whatsapp','extension','system')),
  note          text
);
create index if not exists approvals_asset_idx on approvals (asset_id, decided_at desc);

-- ---------------------------------------------------------------- actions (audit log)
-- Every post, send and spend passes through the actions service and lands here, executed or not.
create table if not exists actions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces (id) on delete cascade,
  asset_id         uuid references assets (id) on delete set null,
  kind             text not null check (kind in ('post','send','spend')),
  provider         text not null,
  idempotency_key  text not null unique,
  status           text not null check (status in ('executed','simulated','copy_and_post','blocked','failed')),
  reason           text,
  amount_cents     integer,
  payload          jsonb not null default '{}'::jsonb,
  result           jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists actions_ws_idx on actions (workspace_id, created_at desc);

-- ---------------------------------------------------------------- job queue
create table if not exists jobs (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references workspaces (id) on delete cascade,
  type             text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'queued' check (status in ('queued','running','done','failed','dead')),
  attempts         integer not null default 0,
  max_attempts     integer not null default 5,
  run_at           timestamptz not null default now(),
  locked_at        timestamptz,
  locked_by        text,
  last_error       text,
  idempotency_key  text unique,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index if not exists jobs_ready_idx on jobs (run_at) where status = 'queued';

-- Claim up to n ready jobs. SKIP LOCKED lets several workers run safely; stale locks
-- (worker died mid-job) are reclaimed after 10 minutes.
create or replace function claim_jobs(p_worker text, p_limit integer default 5)
returns setof jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update jobs j set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
  where j.id in (
    select id from jobs
    where (status = 'queued' and run_at <= now())
       or (status = 'running' and locked_at < now() - interval '10 minutes')
    order by run_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
end;
$$;

-- Enqueue from the app (owner) or the worker. Idempotent on the key.
create or replace function enqueue_job(p_workspace uuid, p_type text, p_payload jsonb default '{}'::jsonb,
                                       p_run_at timestamptz default now(), p_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_workspace is not null and auth.uid() is not null and not is_workspace_owner(p_workspace) then
    raise exception 'not allowed';
  end if;
  insert into jobs (workspace_id, type, payload, run_at, idempotency_key)
  values (p_workspace, p_type, p_payload, p_run_at, p_key)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from jobs where idempotency_key = p_key;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- usage metering
-- Caps per plan (PRD section 14). null = unlimited, 0 = not included.
create table if not exists plan_limits (
  plan        text not null,
  metric      text not null check (metric in ('videos','images','ai_drafts','monitors','x_reads','products')),
  monthly_cap integer,
  primary key (plan, metric)
);
insert into plan_limits (plan, metric, monthly_cap) values
  ('free','videos',0), ('free','images',5), ('free','ai_drafts',0), ('free','monitors',0), ('free','x_reads',0), ('free','products',1),
  ('launch_pass','videos',3), ('launch_pass','images',60), ('launch_pass','ai_drafts',100), ('launch_pass','monitors',3), ('launch_pass','x_reads',0), ('launch_pass','products',1),
  ('grow','videos',4), ('grow','images',60), ('grow','ai_drafts',150), ('grow','monitors',3), ('grow','x_reads',0), ('grow','products',1),
  ('scale','videos',12), ('scale','images',200), ('scale','ai_drafts',500), ('scale','monitors',10), ('scale','x_reads',5000), ('scale','products',3)
on conflict (plan, metric) do update set monthly_cap = excluded.monthly_cap;

create table if not exists usage (
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  period        date not null,          -- first day of the month (UTC)
  videos        integer not null default 0,
  images        integer not null default 0,
  ai_drafts     integer not null default 0,
  x_reads       integer not null default 0,
  cost_usd      numeric(10,4) not null default 0,
  primary key (workspace_id, period)
);

-- Atomically consume quota. Returns false (and consumes nothing) when the cap would be exceeded.
create or replace function consume_usage(p_workspace uuid, p_metric text, p_amount integer default 1, p_cost numeric default 0)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_cap integer;
  v_used integer;
begin
  if p_metric not in ('videos','images','ai_drafts','x_reads') then
    raise exception 'unknown metric %', p_metric;
  end if;
  select l.monthly_cap into v_cap from plan_limits l join workspaces w on w.plan = l.plan
  where w.id = p_workspace and l.metric = p_metric;

  insert into usage (workspace_id, period) values (p_workspace, v_period) on conflict do nothing;
  execute format('select %I from usage where workspace_id = $1 and period = $2 for update', p_metric)
    into v_used using p_workspace, v_period;

  if v_cap is not null and v_used + p_amount > v_cap then
    return false;
  end if;
  execute format('update usage set %I = %I + $1, cost_usd = cost_usd + $2 where workspace_id = $3 and period = $4', p_metric, p_metric)
    using p_amount, p_cost, p_workspace, v_period;
  return true;
end;
$$;
revoke execute on function consume_usage from public, anon, authenticated;
revoke execute on function claim_jobs from public, anon, authenticated;

create table if not exists approval_time_log (
  workspace_id   uuid not null references workspaces (id) on delete cascade,
  date           date not null,
  seconds_spent  integer not null default 0,
  primary key (workspace_id, date)
);

-- ---------------------------------------------------------------- notifications
create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null,      -- pending_approval, expiring_soon, trust_dropped, cap_reached, digest
  title         text not null,
  body          text,
  url           text,
  channels      text[] not null default '{}',   -- where it was delivered
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- RLS for workspace tables
do $$
declare t text;
begin
  -- owner can read + write
  foreach t in array array['brand_brains','voice_profiles','brand_kits','assets','approvals','approval_time_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "owner all %1$s" on %1$I for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id))', t);
  end loop;
  -- owner can read; only the service role writes
  foreach t in array array['connections','actions','jobs','usage'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "owner reads %1$s" on %1$I for select using (is_workspace_owner(workspace_id))', t);
  end loop;
end $$;

alter table plan_limits enable row level security;
create policy "anyone reads plan limits" on plan_limits for select using (true);

alter table notifications enable row level security;
create policy "own notifications read" on notifications for select using (user_id = auth.uid());
create policy "own notifications update" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Connections: the browser may list connections but never read the encrypted token.
revoke select on connections from anon, authenticated;
grant select (id, workspace_id, provider, scopes, account_label, expires_at, status, created_at) on connections to authenticated;
