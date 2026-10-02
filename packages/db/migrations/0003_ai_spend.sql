-- 0003: AI spend ledger. Every model call is costed here so a hard monthly budget can be enforced
-- before the next call. Service role only (RLS on, no policies).
create table if not exists ai_calls (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid references workspaces (id) on delete set null,
  purpose            text not null,          -- brand_brain, draft_post, score, ...
  model              text not null,
  prompt_version     text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(10,6) not null default 0,
  ok                 boolean not null default true,
  error              text,
  created_at         timestamptz not null default now()
);
create index if not exists ai_calls_month_idx on ai_calls (created_at);
alter table ai_calls enable row level security;

-- Spend so far this calendar month (UTC).
create or replace function ai_spend_this_month()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from ai_calls where created_at >= date_trunc('month', now() at time zone 'utc');
$$;
revoke execute on function ai_spend_this_month from public, anon, authenticated;
