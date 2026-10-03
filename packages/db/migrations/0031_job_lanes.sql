-- Two lanes: slow render jobs (videos, carousels, the readiness check) never hold up quick ones (analyses, drafts,
-- emails). Each worker runs one loop per lane.
create or replace function claim_jobs_lane(p_worker text, p_limit integer, p_types text[], p_only boolean)
returns setof jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update jobs j set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
  where j.id in (
    select id from jobs
    where ((status = 'queued' and run_at <= now()) or (status = 'running' and locked_at < now() - interval '15 minutes'))
      and (case when p_only then type = any(p_types) else not (type = any(p_types)) end)
    order by run_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
end;
$$;
revoke all on function claim_jobs_lane(text, integer, text[], boolean) from public, anon, authenticated;
