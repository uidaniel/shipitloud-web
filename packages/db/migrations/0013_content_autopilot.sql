-- Content autopilot: plan next week's posts every Sunday evening (opt-in per workspace).
alter table content_sources add column if not exists weekly_plan boolean not null default false;
alter table content_sources add column if not exists last_planned_at timestamptz;
grant select (weekly_plan, last_planned_at) on content_sources to authenticated;
