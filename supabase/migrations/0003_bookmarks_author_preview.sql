-- Optional author + link preview thumbnail (PRD 收藏详情 / 列表缩略图)

alter table public.bookmarks
  add column if not exists author text;

alter table public.bookmarks
  add column if not exists preview_image_url text;
