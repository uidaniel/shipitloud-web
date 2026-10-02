-- The first view of a day must count as 1, not 0.
create or replace function blog_view(p_post uuid)
returns void language sql security definer set search_path = public as $$
  insert into blog_views (post_id, views) values (p_post, 1)
  on conflict (post_id, day) do update set views = blog_views.views + 1;
  update blog_posts set views = views + 1 where id = p_post;
$$;
revoke execute on function blog_view from public, anon, authenticated;
