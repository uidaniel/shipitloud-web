-- 0004: brand brain build status and the extra fields the brand brain produces.
alter table brand_brains add column if not exists status text not null default 'idle'
  check (status in ('idle','building','ready','failed'));
alter table brand_brains add column if not exists error text;
alter table brand_brains add column if not exists description text;     -- founder's own words, when there's no site
alter table brand_brains add column if not exists one_liner text;
alter table brand_brains add column if not exists category text;
alter table brand_brains add column if not exists confidence integer;
alter table brand_brains add column if not exists sources text[] not null default '{}';
alter table brand_brains add column if not exists model text;
alter table brand_brains add column if not exists prompt_version text;

alter table voice_profiles add column if not exists tone text;
alter table voice_profiles add column if not exists dos text[] not null default '{}';
alter table voice_profiles add column if not exists donts text[] not null default '{}';
