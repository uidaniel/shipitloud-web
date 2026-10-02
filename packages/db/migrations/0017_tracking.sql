-- Tracking (PRD section 6/9 "Analytics": own short links with UTM, signup snippet, per-channel attribution,
-- momentum dashboard). Privacy by design: no cookies, no IP addresses stored, a random visitor id only.

alter table workspaces add column if not exists tracking_key text unique default replace(gen_random_uuid()::text, '-', '');
update workspaces set tracking_key = replace(gen_random_uuid()::text, '-', '') where tracking_key is null;

create table if not exists short_links (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces (id) on delete cascade,
  code             text not null unique check (code ~ '^[A-Za-z0-9]{5,12}$'),
  target_url       text not null,
  source           text not null,             -- channel: x, linkedin, reddit, hn, instagram, tiktok, email, blog, ...
  medium           text not null default 'social',
  campaign         text,
  asset_id         uuid references assets (id) on delete set null,
  clicks           integer not null default 0,
  last_clicked_at  timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists short_links_ws_idx on short_links (workspace_id, created_at desc);
create unique index if not exists short_links_asset_target on short_links (asset_id, target_url) where asset_id is not null;
alter table short_links enable row level security;
create policy "owner read"   on short_links for select using (is_workspace_owner(workspace_id));
create policy "owner insert" on short_links for insert with check (is_workspace_owner(workspace_id));
create policy "owner delete" on short_links for delete using (is_workspace_owner(workspace_id));

create table if not exists link_clicks (
  link_id  uuid not null references short_links (id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  clicks   integer not null default 0,
  primary key (link_id, day)
);
alter table link_clicks enable row level security;
create policy "owner read" on link_clicks for select using (exists (select 1 from short_links l where l.id = link_id and is_workspace_owner(l.workspace_id)));

create table if not exists track_events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  type          text not null check (type in ('pageview','signup','custom')),
  name          text,                        -- for custom events
  visitor       text,                        -- random id kept in the visitor's own browser
  source        text,                        -- first-touch channel (utm_source or short link)
  medium        text,
  campaign      text,
  ref_code      text,                        -- short link code
  path          text,
  referrer_host text,
  created_at    timestamptz not null default now()
);
create index if not exists track_events_ws_idx on track_events (workspace_id, type, created_at desc);
alter table track_events enable row level security;
create policy "owner read" on track_events for select using (is_workspace_owner(workspace_id));

-- Click counter used by the redirect route (service role).
create or replace function link_click(p_link uuid)
returns void language sql security definer set search_path = public as $$
  insert into link_clicks (link_id, clicks) values (p_link, 1)
  on conflict (link_id, day) do update set clicks = link_clicks.clicks + 1;
  update short_links set clicks = clicks + 1, last_clicked_at = now() where id = p_link;
$$;
revoke execute on function link_click from public, anon, authenticated;

-- Channel names as people say them: utm "twitter" and "x" are one channel, and so on.
create or replace function channel_of(p text)
returns text language sql immutable as $$
  select case
    when p is null or p = '' then 'direct'
    when lower(p) in ('x','twitter','t.co') then 'x'
    when lower(p) in ('linkedin','lnkd.in') then 'linkedin'
    when lower(p) in ('reddit','reddit_extension') then 'reddit'
    when lower(p) in ('hn','hackernews','news.ycombinator.com') then 'hn'
    when lower(p) in ('ig','instagram') then 'instagram'
    when lower(p) in ('yt','youtube') then 'youtube'
    when lower(p) in ('wa','whatsapp') then 'whatsapp'
    when lower(p) in ('referral','waitlist_referral') then 'referral'
    else lower(left(p, 40))
  end
$$;

-- Momentum, day by day: what ShipItLoud found and did, and what came back.
create or replace function momentum_daily(p_ws uuid, p_days integer default 30)
returns table (day date, conversations integer, replies integer, posts integer, clicks integer, signups integer)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series((now() at time zone 'utc')::date - (p_days - 1), (now() at time zone 'utc')::date, interval '1 day')::date as day
  )
  select d.day,
    (select count(*)::int from mentions m where m.workspace_id = p_ws and m.created_at::date = d.day),
    (select count(*)::int from mentions m where m.workspace_id = p_ws and m.status = 'replied' and coalesce((select a.updated_at from assets a where a.id = m.draft_asset_id), m.created_at)::date = d.day),
    (select count(*)::int from assets a where a.workspace_id = p_ws and a.status = 'published' and a.type in ('post','poster','video','article') and a.updated_at::date = d.day),
    (select coalesce(sum(c.clicks), 0)::int from link_clicks c join short_links l on l.id = c.link_id where l.workspace_id = p_ws and c.day = d.day),
    (select count(*)::int from track_events e where e.workspace_id = p_ws and e.type = 'signup' and e.created_at::date = d.day)
      + (select count(*)::int from waitlist_signups w where w.workspace_id = p_ws and w.created_at::date = d.day)
  from days d
  where is_workspace_owner(p_ws) or auth.role() = 'service_role'
  order by d.day;
$$;

-- Per channel over the window: clicks, signups and what was posted there.
create or replace function momentum_channels(p_ws uuid, p_days integer default 30)
returns table (channel text, clicks integer, signups integer, posts integer)
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(days => p_days) as t),
  c as (select channel_of(l.source) ch, sum(k.clicks)::int n from link_clicks k join short_links l on l.id = k.link_id, since
        where l.workspace_id = p_ws and k.day >= (select t from since)::date group by 1),
  s as (select channel_of(e.source) ch, count(*)::int n from track_events e, since where e.workspace_id = p_ws and e.type = 'signup' and e.created_at >= since.t group by 1
        union all
        select channel_of(coalesce(nullif(w.source, ''), 'direct')) ch, count(*)::int from waitlist_signups w, since where w.workspace_id = p_ws and w.created_at >= since.t group by 1),
  p as (select channel_of(a.platform) ch, count(*)::int n from assets a, since where a.workspace_id = p_ws and a.status = 'published' and a.updated_at >= since.t group by 1),
  chans as (select ch from c union select ch from s union select ch from p)
  select x.ch, coalesce((select n from c where c.ch = x.ch), 0), coalesce((select sum(n)::int from s where s.ch = x.ch), 0), coalesce((select n from p where p.ch = x.ch), 0)
  from chans x
  where is_workspace_owner(p_ws) or auth.role() = 'service_role'
  order by 3 desc, 2 desc;
$$;
