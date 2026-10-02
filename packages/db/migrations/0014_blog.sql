-- SEO blog engine (PRD section 6): keyword ideas, articles, a hosted blog per workspace, simple view counts.
-- Public pages read published posts through the server (service role), never with the anon key.

create table if not exists blogs (
  workspace_id   uuid primary key references workspaces (id) on delete cascade,
  slug           text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  title          text not null,
  description    text,
  custom_domain  text unique,          -- blog.yourproduct.com, set up at the end
  published      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table blogs enable row level security;
create policy "owner all" on blogs for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

create table if not exists seo_keywords (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  keyword       text not null,
  kind          text not null check (kind in ('best','alternative','versus','howto','usecase','question')),
  source        text not null check (source in ('brand','competitor','listening','manual')),
  why           text,
  priority      integer not null default 50 check (priority between 0 and 100),
  status        text not null default 'idea' check (status in ('idea','writing','written','skipped')),
  created_at    timestamptz not null default now(),
  unique (workspace_id, keyword)
);
create index if not exists seo_keywords_ws_idx on seo_keywords (workspace_id, status, priority desc);
alter table seo_keywords enable row level security;
create policy "owner all" on seo_keywords for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

create table if not exists blog_posts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  keyword_id    uuid references seo_keywords (id) on delete set null,
  keyword       text not null,
  title         text not null,
  slug          text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  excerpt       text,
  body          text not null,                       -- markdown
  meta          jsonb not null default '{}'::jsonb,   -- { title, description }
  faq           jsonb not null default '[]'::jsonb,   -- [{ q, a }]
  seo_score     integer,
  seo_tips      text[] not null default '{}',
  asset_id      uuid references assets (id) on delete set null,
  status        text not null default 'draft' check (status in ('draft','published','unpublished')),
  published_at  timestamptz,
  rank          integer,                              -- from Search Console once connected
  views         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, slug)
);
create index if not exists blog_posts_ws_idx on blog_posts (workspace_id, status, published_at desc);
alter table blog_posts enable row level security;
create policy "owner all" on blog_posts for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

-- Views: one row per post per day, no cookies or personal data.
create table if not exists blog_views (
  post_id  uuid not null references blog_posts (id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  views    integer not null default 0,
  primary key (post_id, day)
);
alter table blog_views enable row level security;

create or replace function blog_view(p_post uuid)
returns void language sql security definer set search_path = public as $$
  insert into blog_views (post_id) values (p_post)
  on conflict (post_id, day) do update set views = blog_views.views + 1;
  update blog_posts set views = views + 1 where id = p_post;
$$;
revoke execute on function blog_view from public, anon, authenticated;
