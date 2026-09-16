-- supabase/migrations/202609160001_materials_preview_storage.sql
alter table public.materials
  add column if not exists preview_storage_object_key text;
