-- Weekly digest and the first 7 days report (PRD sections 6, 9): what happened, what worked, the next three actions.
create table if not exists digests (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  kind          text not null check (kind in ('weekly','first_week')),
  period_start  date not null,
  period_end    date not null,
  stats         jsonb not null default '{}'::jsonb,
  summary       text not null,
  worked        text[] not null default '{}',
  actions       jsonb not null default '[]'::jsonb,   -- [{ title, why, href }]
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (workspace_id, kind, period_start)
);
create index if not exists digests_ws_idx on digests (workspace_id, created_at desc);
alter table digests enable row level security;
create policy "owner read" on digests for select using (is_workspace_owner(workspace_id));
