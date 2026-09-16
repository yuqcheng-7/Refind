-- Persist private Storage object key for uploaded-file list covers.
alter table public.materials
  add column if not exists cover_storage_object_key text;
