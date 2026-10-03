-- Each ad runs in its own ad set so autopilot can move budget between ads (Meta budgets live on ad sets).
alter table ads add column if not exists external_adset_id text;
-- Meta link ads are published as a Facebook Page.
alter table ad_settings add column if not exists meta_page_id text;
