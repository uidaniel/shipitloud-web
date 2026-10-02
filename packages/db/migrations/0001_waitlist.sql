-- 0001: workspaces + waitlist (Day 0 public site).
-- Every table carries workspace_id and has RLS on. Public signups go through the
-- server with the service role key, which bypasses RLS; there are no anon policies.

create extension if not exists pgcrypto;

create table if not exists workspaces (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users (id) on delete set null,
  product_name  text not null,
  url           text,
  plan          text not null default 'free' check (plan in ('free', 'launch_pass', 'grow', 'scale')),
  stage         text not null default 'launch' check (stage in ('launch', 'grow')),
  trust_mode    text not null default 'manual' check (trust_mode in ('manual', 'trust', 'full')),
  created_at    timestamptz not null default now()
);

create table if not exists waitlist_pages (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces (id) on delete cascade,
  slug           text not null unique,
  custom_domain  text unique,
  template_id    text,
  next_position  integer not null default 1,
  published_at   timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists waitlist_signups (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces (id) on delete cascade,
  page_id           uuid not null references waitlist_pages (id) on delete cascade,
  email             text not null,
  email_normalized  text not null,
  consent           boolean not null,
  consent_text      text not null,
  referral_code     text not null unique,
  referrer_id       uuid references waitlist_signups (id) on delete set null,
  referral_count    integer not null default 0,
  position          integer not null,          -- base position at signup; effective rank is computed
  product_url       text,
  source            text not null default 'direct',
  campaign          text,
  ip_hash           text,
  flagged           boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (page_id, email_normalized)
);
create index if not exists waitlist_signups_page_idx on waitlist_signups (page_id);

create table if not exists signup_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  signup_id     uuid references waitlist_signups (id) on delete cascade,
  source        text not null,
  campaign      text,
  link_id       uuid,
  consent       boolean not null,
  created_at    timestamptz not null default now()
);
create index if not exists signup_events_ws_idx on signup_events (workspace_id, created_at);

alter table workspaces        enable row level security;
alter table waitlist_pages    enable row level security;
alter table waitlist_signups  enable row level security;
alter table signup_events     enable row level security;

create policy "owner reads workspace" on workspaces
  for select using (owner_id = auth.uid());
create policy "owner reads pages" on waitlist_pages
  for select using (exists (select 1 from workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy "owner reads signups" on waitlist_signups
  for select using (exists (select 1 from workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy "owner reads signup events" on signup_events
  for select using (exists (select 1 from workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

-- Effective rank: each counted referral moves a signup up p_boost places.
create or replace function waitlist_status(p_code text, p_boost integer default 5)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s waitlist_signups;
  v_rank integer;
  v_total integer;
begin
  select * into s from waitlist_signups where referral_code = p_code;
  if not found then
    return null;
  end if;

  select count(*) + 1 into v_rank
  from waitlist_signups o
  where o.page_id = s.page_id
    and o.id <> s.id
    and ((o.position - p_boost * o.referral_count) < (s.position - p_boost * s.referral_count)
      or ((o.position - p_boost * o.referral_count) = (s.position - p_boost * s.referral_count)
          and o.position < s.position));

  select count(*) into v_total from waitlist_signups where page_id = s.page_id;

  return json_build_object(
    'code', s.referral_code,
    'position', v_rank,
    'referrals', s.referral_count,
    'total', v_total
  );
end;
$$;

-- Atomic join: locks the page row so positions are unique and gap-free.
create or replace function waitlist_join(
  p_page_slug        text,
  p_email            text,
  p_email_normalized text,
  p_consent          boolean,
  p_consent_text     text,
  p_code             text,
  p_ref_code         text,
  p_product_url      text,
  p_source           text,
  p_campaign         text,
  p_ip_hash          text,
  p_boost            integer default 5
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  pg waitlist_pages;
  existing waitlist_signups;
  ref waitlist_signups;
  v_id uuid;
  v_flagged boolean := false;
begin
  select * into pg from waitlist_pages where slug = p_page_slug for update;
  if not found then
    raise exception 'waitlist page % not found', p_page_slug;
  end if;

  select * into existing from waitlist_signups
  where page_id = pg.id and email_normalized = p_email_normalized;
  if found then
    return (jsonb_build_object('existing', true) || waitlist_status(existing.referral_code, p_boost)::jsonb)::json;
  end if;

  if p_ref_code is not null then
    select * into ref from waitlist_signups where page_id = pg.id and referral_code = p_ref_code;
    if found then
      -- Same network as the referrer: record the link but don't count it.
      if ref.ip_hash is not null and ref.ip_hash = p_ip_hash then
        v_flagged := true;
      else
        update waitlist_signups set referral_count = referral_count + 1 where id = ref.id;
      end if;
    end if;
  end if;

  insert into waitlist_signups (
    workspace_id, page_id, email, email_normalized, consent, consent_text, referral_code,
    referrer_id, position, product_url, source, campaign, ip_hash, flagged
  ) values (
    pg.workspace_id, pg.id, p_email, p_email_normalized, p_consent, p_consent_text, p_code,
    ref.id, pg.next_position, p_product_url, p_source, p_campaign, p_ip_hash, v_flagged
  ) returning id into v_id;

  update waitlist_pages set next_position = next_position + 1 where id = pg.id;

  insert into signup_events (workspace_id, signup_id, source, campaign, consent)
  values (pg.workspace_id, v_id, p_source, p_campaign, p_consent);

  return (jsonb_build_object('existing', false) || waitlist_status(p_code, p_boost)::jsonb)::json;
end;
$$;

-- Public momentum numbers for a page: total and signups by source.
create or replace function waitlist_stats(p_page_slug text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'total', (select count(*) from waitlist_signups s join waitlist_pages p on p.id = s.page_id where p.slug = p_page_slug),
    'last7', (select count(*) from waitlist_signups s join waitlist_pages p on p.id = s.page_id
              where p.slug = p_page_slug and s.created_at > now() - interval '7 days'),
    'bySource', coalesce((
      select json_agg(json_build_object('source', source, 'count', n) order by n desc)
      from (select s.source, count(*) n from waitlist_signups s join waitlist_pages p on p.id = s.page_id
            where p.slug = p_page_slug group by s.source) t
    ), '[]'::json)
  );
$$;

revoke execute on function waitlist_join from public, anon, authenticated;
revoke execute on function waitlist_status from public, anon, authenticated;
revoke execute on function waitlist_stats from public, anon, authenticated;

-- ShipItLoud is customer zero: its own waitlist lives in its own workspace.
insert into workspaces (product_name, url, plan)
select 'ShipItLoud', 'https://shipitloud.com', 'scale'
where not exists (select 1 from workspaces where product_name = 'ShipItLoud');

insert into waitlist_pages (workspace_id, slug, published_at)
select id, 'shipitloud', now() from workspaces where product_name = 'ShipItLoud'
on conflict (slug) do nothing;
