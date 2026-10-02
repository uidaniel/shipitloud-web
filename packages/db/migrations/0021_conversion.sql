-- Landing page audit and network launch (PRD section 5 "Network launch", "Conversion fixes", "Landing page audit").

create table if not exists page_audits (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  url           text not null,
  status        text not null default 'ready' check (status in ('ready','failed')),
  error         text,
  facts         jsonb not null default '{}'::jsonb,    -- headline, buttons, trust signals as we read them
  fixes         jsonb not null default '{}'::jsonb,    -- { clarity, cta, trust }: { problem, quote, fix, rewrite }
  hints         jsonb not null default '[]'::jsonb,    -- [{ area, issue }] from our own checks
  model         text,
  prompt_version text,
  created_at    timestamptz not null default now()
);
create index if not exists page_audits_ws_idx on page_audits (workspace_id, created_at desc);
alter table page_audits enable row level security;
create policy "owner read" on page_audits for select using (is_workspace_owner(workspace_id));

-- One set of personal launch messages per workspace; a new draft replaces it.
create table if not exists network_kits (
  workspace_id  uuid primary key references workspaces (id) on delete cascade,
  messages      jsonb not null default '{}'::jsonb,   -- { friends, professional, peers, linkedin_post }
  links         jsonb not null default '{}'::jsonb,   -- tracked short link per message
  sent          jsonb not null default '{}'::jsonb,   -- how many people the founder sent each one to
  model         text,
  prompt_version text,
  updated_at    timestamptz not null default now()
);
alter table network_kits enable row level security;
create policy "owner read" on network_kits for select using (is_workspace_owner(workspace_id));

-- Counting a send is the only thing the founder writes directly; one at a time, never below zero.
create or replace function network_sent(p_ws uuid, p_kind text, p_delta integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_workspace_owner(p_ws) or p_kind not in ('friends','professional','peers','linkedin_post') or abs(p_delta) <> 1 then
    raise exception 'not allowed';
  end if;
  update network_kits set sent = jsonb_set(sent, array[p_kind], to_jsonb(greatest(0, coalesce((sent ->> p_kind)::int, 0) + p_delta)))
    where workspace_id = p_ws returning (sent ->> p_kind)::int into n;
  return coalesce(n, 0);
end;
$$;
