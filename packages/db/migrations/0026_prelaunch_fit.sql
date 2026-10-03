-- PRD v5: ShipItLoud has no waitlist of its own. Before launch the site takes "email me when it's live" (tagged
-- prelaunch, one launch-day message, not counted as setups). "Which fits you?" moves to the first setup screen and
-- is stored on the workspace, to tailor the plan (launch kit first or growth first).
alter table waitlist_signups drop column if exists fit;
alter table waitlist_signups add column if not exists prelaunch boolean not null default false;
alter table workspaces add column if not exists fit text check (fit in ('launching_soon','already_live','exploring'));
