-- PRD section 11 "Validate before billing": ShipItLoud's own waitlist asks "Which fits you?" and stores the answer,
-- reviewed before billing is built to confirm which plan to lead with.
alter table waitlist_signups add column if not exists fit text check (fit in ('launching_soon','already_live','exploring'));
