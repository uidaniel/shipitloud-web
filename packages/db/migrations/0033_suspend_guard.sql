-- 0033: a suspended workspace can't switch its kill switch back off from the browser (PRD section 25, abuse controls).
create or replace function guard_workspace_billing()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.free_wins_used := 0;
    new.referral_code := null;
    new.referred_by := null;
    new.suspended_at := null;
    new.suspended_reason := null;
    return new;
  end if;
  if new.plan is distinct from old.plan
     or new.free_wins_used is distinct from old.free_wins_used
     or new.referral_code is distinct from old.referral_code
     or new.referred_by is distinct from old.referred_by
     or new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason then
    raise exception 'plan and billing fields are read-only' using errcode = '42501';
  end if;
  if old.suspended_at is not null and old.kill_switch and not new.kill_switch then
    raise exception 'this workspace is suspended' using errcode = '42501';
  end if;
  return new;
end;
$$;
