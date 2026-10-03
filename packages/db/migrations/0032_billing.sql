-- 0032: billing, free-to-paid and retention (PRD sections 24 and 25).
-- Subscriptions are synced from Dodo Payments webhooks (or the test-mode simulator); the plan on a
-- workspace only ever changes on the server.

-- ---------------------------------------------------------------- workspace billing fields
alter table workspaces add column if not exists free_wins_used   integer not null default 0;
alter table workspaces add column if not exists referral_code    text unique;
alter table workspaces add column if not exists referred_by      uuid references workspaces (id) on delete set null;
alter table workspaces add column if not exists suspended_at     timestamptz;
alter table workspaces add column if not exists suspended_reason text;

-- The owner policy lets founders update their workspace; these fields are not theirs to change.
create or replace function guard_workspace_billing()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.free_wins_used := 0;
    new.referral_code := null;
    new.referred_by := null;
    new.suspended_at := null;
    new.suspended_reason := null;
    return new;
  end if;
  if new.plan is distinct from old.plan
     or new.free_wins_used is distinct from old.free_wins_used
     or new.referral_code is distinct from old.referral_code
     or new.referred_by is distinct from old.referred_by
     or new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason then
    raise exception 'plan and billing fields are read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists workspaces_guard_billing on workspaces;
create trigger workspaces_guard_billing before insert or update on workspaces
  for each row execute function guard_workspace_billing();

-- First wins on the Free plan: up to 3 approved items published or sent, counted atomically.
create or replace function use_free_win(p_workspace uuid, p_limit integer default 3)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  update workspaces set free_wins_used = free_wins_used + 1
  where id = p_workspace and (plan <> 'free' or free_wins_used < p_limit)
  returning true into v_ok;
  -- Paid plans don't count wins; undo the increment for them.
  update workspaces set free_wins_used = free_wins_used - 1 where id = p_workspace and plan <> 'free' and v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke execute on function use_free_win from public, anon, authenticated;

-- ---------------------------------------------------------------- subscriptions
create table if not exists subscriptions (
  workspace_id          uuid primary key references workspaces (id) on delete cascade,
  plan                  text not null check (plan in ('launch_pass', 'grow', 'scale')),
  status                text not null check (status in ('pending', 'trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  provider              text not null default 'dodo' check (provider in ('dodo', 'simulator')),
  provider_id           text unique,                -- Dodo subscription id (or payment id for a Launch Pass)
  customer_id           text,
  trial_ends_at         timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  paused_until          timestamptz,
  past_due_since        timestamptz,
  discount_until        timestamptz,              -- retention offer: 30% off for 2 months
  reminded_at           timestamptz,              -- day-5 trial reminder sent
  first_paid_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table subscriptions enable row level security;
create policy "owner reads subscription" on subscriptions for select using (is_workspace_owner(workspace_id));

-- Every webhook, kept once (webhook-id) for idempotency and debugging.
create table if not exists billing_events (
  id            text primary key,
  type          text not null,
  workspace_id  uuid references workspaces (id) on delete set null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);
alter table billing_events enable row level security;

-- ---------------------------------------------------------------- cancellation, referrals
create table if not exists cancellations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces (id) on delete cascade,
  reason          text check (reason in ('too_expensive', 'no_results', 'too_much_work', 'missing_feature', 'launched_done', 'other')),
  comment         text,
  offer_shown     text,
  offer_accepted  boolean not null default false,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists cancellations_ws_idx on cancellations (workspace_id, created_at desc);
alter table cancellations enable row level security;
create policy "owner reads cancellations" on cancellations for select using (is_workspace_owner(workspace_id));

create table if not exists referrals (
  id                     uuid primary key default gen_random_uuid(),
  referrer_workspace_id  uuid not null references workspaces (id) on delete cascade,
  referred_workspace_id  uuid not null unique references workspaces (id) on delete cascade,
  status                 text not null default 'pending' check (status in ('pending', 'qualified', 'rewarded', 'blocked')),
  blocked_reason         text,
  reward_applied_at      timestamptz,
  created_at             timestamptz not null default now()
);
alter table referrals enable row level security;
create policy "referrer reads referrals" on referrals for select using (is_workspace_owner(referrer_workspace_id));

-- ---------------------------------------------------------------- lifecycle, support, deletion, admin
-- Messages to founders (setup nudges, trial reminders, win-back). One row per message, never sent twice.
create table if not exists lifecycle_messages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  type          text not null,
  key           text not null default '',
  channel       text not null default 'email',
  sent_at       timestamptz not null default now(),
  opened_at     timestamptz,
  clicked_at    timestamptz,
  unique (workspace_id, type, key)
);
alter table lifecycle_messages enable row level security;
create policy "owner reads lifecycle messages" on lifecycle_messages for select using (is_workspace_owner(workspace_id));

create table if not exists support_tickets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces (id) on delete set null,
  user_id       uuid references auth.users (id) on delete set null,
  email         text not null,
  channel       text not null default 'in_app',
  subject       text not null,
  body          text not null,
  status        text not null default 'open' check (status in ('open', 'answered', 'resolved')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
alter table support_tickets enable row level security;
create policy "own tickets read" on support_tickets for select using (user_id = auth.uid());

create table if not exists deletion_requests (
  workspace_id   uuid primary key references workspaces (id) on delete cascade,
  requested_by   uuid references auth.users (id) on delete set null,
  requested_at   timestamptz not null default now(),
  scheduled_for  timestamptz not null,
  cancelled_at   timestamptz,
  completed_at   timestamptz
);
alter table deletion_requests enable row level security;
create policy "owner reads deletion" on deletion_requests for select using (is_workspace_owner(workspace_id));

-- Kept after a workspace is gone: what was deleted or exported, when, by whom.
create table if not exists admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid,
  action      text not null,
  target      text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table admin_audit_log enable row level security;
