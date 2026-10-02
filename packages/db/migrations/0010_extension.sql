-- Chrome extension (PRD section 17): per-workspace connection tokens and the safety pre-flight log.

create table if not exists extension_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  token_hash    text not null unique,        -- sha-256 of the token; the token itself is shown once
  label         text not null default 'Chrome',
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
alter table extension_tokens enable row level security;
create policy "owner read" on extension_tokens for select using (is_workspace_owner(workspace_id));

create table if not exists safety_checks (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces (id) on delete cascade,
  mention_id        uuid references mentions (id) on delete set null,
  platform          text not null default 'reddit',
  community         text not null,
  rule_summary      text,
  self_promo_ratio  numeric(5,2),
  past_removals     integer not null default 0,
  verdict           text not null check (verdict in ('ok','warn','block')),
  reasons           jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists safety_checks_ws_idx on safety_checks (workspace_id, created_at desc);
alter table safety_checks enable row level security;
create policy "owner read" on safety_checks for select using (is_workspace_owner(workspace_id));
