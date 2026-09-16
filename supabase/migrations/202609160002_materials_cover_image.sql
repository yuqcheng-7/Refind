-- Persist link/platform cover thumbnails for knowledge list cards.
alter table public.materials
  add column if not exists cover_image_url text;
