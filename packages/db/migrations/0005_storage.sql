-- 0005: public bucket for rendered assets (posters, video thumbnails). Files are written by the
-- worker (service role) under <workspace_id>/...; paths include a random id so they aren't guessable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'video/mp4'])
on conflict (id) do nothing;
