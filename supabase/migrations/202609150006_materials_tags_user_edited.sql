-- supabase/migrations/202609150005_materials_tags_user_edited.sql
alter table public.materials
  add column if not exists tags_user_edited boolean not null default false;

create unique index if not exists material_tags_user_id_name_unique
  on public.material_tags (user_id, name);
