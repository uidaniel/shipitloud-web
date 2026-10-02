-- One signup per visitor per day, enforced by the database: a form submit and a script call can arrive at the same moment.
create unique index if not exists track_events_signup_once on track_events (workspace_id, visitor, ((created_at at time zone 'utc')::date)) where type = 'signup' and visitor is not null;
