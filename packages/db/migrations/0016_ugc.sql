-- UGC engine level 1 (PRD section 22): format remix videos and carousels, with a licence on record for every clip.

create table if not exists footage_licences (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid references workspaces (id) on delete cascade,   -- null for shared stock
  source          text not null check (source in ('founder','brand','pexels','motx','ai')),
  clip_id         text not null,
  url             text,
  licence_type    text not null,           -- e.g. "Owned by the founder", "Pexels License"
  commercial_use  boolean not null,
  attribution     text,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (source, clip_id, workspace_id)
);
alter table footage_licences enable row level security;
create policy "owner read" on footage_licences for select using (workspace_id is null or is_workspace_owner(workspace_id));

create table if not exists ugc_videos (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces (id) on delete cascade,
  format_id       uuid references viral_formats (id) on delete set null,
  format_slug     text,
  kind            text not null default 'video' check (kind in ('video','carousel')),
  idea            text not null,
  script          jsonb not null default '{}'::jsonb,     -- beats / slides, caption, audio idea
  variant         text not null default 'A',              -- hook variant A/B/C
  footage_sources text[] not null default '{}',           -- clip ids used
  licence_ids     uuid[] not null default '{}',
  file_url        text,
  slides          text[] not null default '{}',           -- carousel slide images
  asset_id        uuid references assets (id) on delete set null,
  status          text not null default 'rendering' check (status in ('rendering','ready','failed')),
  publish_score   integer,
  metrics         jsonb not null default '{}'::jsonb,     -- views, likes, saves, signups per variant (entered or imported)
  created_at      timestamptz not null default now()
);
create index if not exists ugc_videos_ws_idx on ugc_videos (workspace_id, created_at desc);
alter table ugc_videos enable row level security;
create policy "owner read" on ugc_videos for select using (is_workspace_owner(workspace_id));
create policy "owner update" on ugc_videos for update using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

-- Animated brand backgrounds are ours: one shared licence row covers them.
insert into footage_licences (workspace_id, source, clip_id, licence_type, commercial_use)
values (null, 'brand', 'brand-backdrop', 'Made by ShipItLoud for your brand', true)
on conflict do nothing;
