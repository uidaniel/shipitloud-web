-- Founders record their own setup progress (start once, complete once); owner-only.
create or replace function setup_step(p_ws uuid, p_step text, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_workspace_owner(p_ws) then raise exception 'not allowed'; end if;
  insert into setup_progress (workspace_id, step, completed_at) values (p_ws, p_step, case when p_done then now() end)
  on conflict (workspace_id, step) do update set completed_at = coalesce(setup_progress.completed_at, excluded.completed_at);
end;
$$;
create policy "owner insert" on setup_progress for insert with check (is_workspace_owner(workspace_id));
