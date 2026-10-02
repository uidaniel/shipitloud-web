-- Emails to the founder's audience via Resend (PRD sections 6, 15): the waitlist sequence and broadcasts.
-- Compliance: consent is collected at signup, every email has one-click unsubscribe and the business address,
-- and each email goes to each person at most once.

create table if not exists email_settings (
  workspace_id      uuid primary key references workspaces (id) on delete cascade,
  from_name         text,
  reply_to          text,
  business_address  text,               -- required in every marketing email (CAN-SPAM)
  sequence_on       boolean not null default false,
  sending_domain    text,               -- their own domain once verified in Resend; until then we send for them
  domain_verified   boolean not null default false,
  updated_at        timestamptz not null default now()
);
alter table email_settings enable row level security;
create policy "owner all" on email_settings for all using (is_workspace_owner(workspace_id)) with check (is_workspace_owner(workspace_id));

alter table waitlist_signups add column if not exists unsubscribed_at timestamptz;

create table if not exists email_sends (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  asset_id     uuid not null references assets (id) on delete cascade,
  signup_id    uuid not null references waitlist_signups (id) on delete cascade,
  kind         text not null,
  status       text not null check (status in ('sent','simulated','failed')),
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now(),
  unique (asset_id, signup_id)
);
create index if not exists email_sends_ws_idx on email_sends (workspace_id, created_at desc);
alter table email_sends enable row level security;
create policy "owner read" on email_sends for select using (is_workspace_owner(workspace_id));
