-- Refind MVP schema (Supabase Postgres)

create extension if not exists "pgcrypto";

-- User profile
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Collections
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_user_id_idx on public.collections (user_id);

-- Bookmarks
create type public.ai_status as enum ('pending','done','failed');

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  collection_id uuid references public.collections (id) on delete set null,
  url text not null,
  source_platform text,
  title text,
  site_name text,
  excerpt text,
  summary text,
  ai_status public.ai_status not null default 'pending',
  ai_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookmarks_user_id_idx on public.bookmarks (user_id);
create index if not exists bookmarks_collection_id_idx on public.bookmarks (collection_id);

-- Tags
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists tags_user_id_idx on public.tags (user_id);

-- Bookmark <-> Tags
create table if not exists public.bookmark_tags (
  bookmark_id uuid not null references public.bookmarks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (bookmark_id, tag_id)
);

-- Updated_at helper
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists trg_collections_touch on public.collections;
create trigger trg_collections_touch before update on public.collections
for each row execute function public.touch_updated_at();

drop trigger if exists trg_bookmarks_touch on public.bookmarks;
create trigger trg_bookmarks_touch before update on public.bookmarks
for each row execute function public.touch_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.bookmarks enable row level security;
alter table public.tags enable row level security;
alter table public.bookmark_tags enable row level security;

-- Profiles: user can read/write own profile
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert with check (id = auth.uid());

-- Collections: CRUD own
drop policy if exists collections_crud_own on public.collections;
create policy collections_crud_own on public.collections
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Bookmarks: CRUD own
drop policy if exists bookmarks_crud_own on public.bookmarks;
create policy bookmarks_crud_own on public.bookmarks
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tags: CRUD own
drop policy if exists tags_crud_own on public.tags;
create policy tags_crud_own on public.tags
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Bookmark tags: only if underlying bookmark belongs to user
drop policy if exists bookmark_tags_crud_own on public.bookmark_tags;
create policy bookmark_tags_crud_own on public.bookmark_tags
for all
using (
  exists (
    select 1 from public.bookmarks b
    where b.id = bookmark_id and b.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.bookmarks b
    where b.id = bookmark_id and b.user_id = auth.uid()
  )
);

