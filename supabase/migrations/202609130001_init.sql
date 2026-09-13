create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 30),
  description text check (description is null or char_length(description) <= 100),
  icon_key text not null default 'folder',
  type text not null check (type in ('default', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create unique index knowledge_bases_one_default_per_user
  on public.knowledge_bases (user_id) where type = 'default';

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  source_url text,
  canonical_url text,
  input_type text not null check (input_type in ('link', 'image', 'pdf', 'doc', 'docx', 'markdown', 'txt', 'pptx', 'xlsx', 'csv', 'note')),
  file_name text,
  file_mime_type text,
  file_size_bytes bigint,
  storage_object_key text,
  parse_attempt_count integer not null default 0 check (parse_attempt_count >= 0),
  last_parse_error text,
  origin_type text not null default 'import' check (origin_type in ('import', 'note')),
  origin_note_id uuid,
  platform_code text not null default 'web' check (platform_code in ('web', 'xhs', 'douyin', 'zhihu', 'bilibili', 'wechat_mp', 'note', 'other')),
  title text,
  author_name text,
  published_at timestamptz,
  content_text text,
  content_excerpt text,
  summary text,
  status text not null default 'processing' check (status in ('processing', 'ready', 'link_only', 'failed', 'deleted')),
  is_new boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (origin_type = 'import' and origin_note_id is null)
    or (origin_type = 'note' and origin_note_id is not null)
  )
);

create unique index materials_unique_canonical_url_per_knowledge_base
  on public.materials (knowledge_base_id, canonical_url)
  where canonical_url is not null;

create table public.material_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.material_tag_relations (
  material_id uuid not null references public.materials(id) on delete cascade,
  tag_id uuid not null references public.material_tags(id) on delete cascade,
  primary key (material_id, tag_id)
);

create table public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  embedding vector,
  source_start integer,
  source_end integer,
  updated_at timestamptz not null default now(),
  unique (material_id, chunk_index)
);

create table public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_code text not null check (platform_code in ('xhs', 'douyin', 'zhihu', 'bilibili', 'wechat_mp')),
  account_display_name text,
  encrypted_session text not null,
  status text not null default 'disconnected' check (status in ('connected', 'expired', 'disconnected')),
  last_verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform_code)
);

create table public.import_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  source_url text,
  input_type text not null check (input_type in ('link', 'image', 'pdf', 'doc', 'docx', 'markdown', 'txt', 'pptx', 'xlsx', 'csv', 'note')),
  storage_object_key text,
  platform_code text not null default 'web' check (platform_code in ('web', 'xhs', 'douyin', 'zhihu', 'bilibili', 'wechat_mp', 'note', 'other')),
  status text not null check (status in ('validating', 'requires_connection', 'parsing', 'preview_ready', 'saving', 'saved', 'parse_failed', 'link_only_saved', 'cancelled')),
  parse_result jsonb,
  error_code text,
  error_message text,
  material_id uuid references public.materials(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  answer_mode text not null check (answer_mode in ('general', 'rag')),
  tag_filters jsonb,
  retrieval_summary jsonb,
  is_insufficient boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.message_citations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  knowledge_base_name_snapshot text,
  material_title_snapshot text,
  excerpt text,
  citation_order integer not null check (citation_order > 0),
  unique (message_id, citation_order)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_default_knowledge_base()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.type = 'default' and auth.uid() is not null then
    raise exception 'The default knowledge base cannot be deleted.';
  end if;

  if tg_op = 'UPDATE'
    and old.type = 'default'
    and new.type <> 'default' then
    raise exception 'The default knowledge base cannot be changed to a custom knowledge base.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger knowledge_bases_protect_default before delete or update on public.knowledge_bases
  for each row execute function public.protect_default_knowledge_base();
create trigger knowledge_bases_set_updated_at before update on public.knowledge_bases
  for each row execute function public.set_updated_at();
create trigger materials_set_updated_at before update on public.materials
  for each row execute function public.set_updated_at();
create trigger material_chunks_set_updated_at before update on public.material_chunks
  for each row execute function public.set_updated_at();
create trigger platform_connections_set_updated_at before update on public.platform_connections
  for each row execute function public.set_updated_at();
create trigger import_tasks_set_updated_at before update on public.import_tasks
  for each row execute function public.set_updated_at();
create trigger chat_conversations_set_updated_at before update on public.chat_conversations
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.knowledge_bases enable row level security;
alter table public.materials enable row level security;
alter table public.material_tags enable row level security;
alter table public.material_tag_relations enable row level security;
alter table public.material_chunks enable row level security;
alter table public.platform_connections enable row level security;
alter table public.import_tasks enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.message_citations enable row level security;

create policy profiles_owner_all on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy knowledge_bases_owner_all on public.knowledge_bases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy materials_owner_all on public.materials
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.knowledge_bases
      where knowledge_bases.id = materials.knowledge_base_id
        and knowledge_bases.user_id = auth.uid()
    )
  );
create policy material_tags_owner_all on public.material_tags
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy material_chunks_owner_all on public.material_chunks
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.materials
      where materials.id = material_chunks.material_id
        and materials.user_id = auth.uid()
    )
    and exists (
      select 1 from public.knowledge_bases
      where knowledge_bases.id = material_chunks.knowledge_base_id
        and knowledge_bases.user_id = auth.uid()
    )
  );
create policy import_tasks_owner_all on public.import_tasks
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.knowledge_bases
      where knowledge_bases.id = import_tasks.knowledge_base_id
        and knowledge_bases.user_id = auth.uid()
    )
    and (
      material_id is null
      or exists (
        select 1 from public.materials
        where materials.id = import_tasks.material_id
          and materials.user_id = auth.uid()
      )
    )
  );
create policy chat_conversations_owner_all on public.chat_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy chat_messages_owner_all on public.chat_messages
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chat_conversations
      where chat_conversations.id = chat_messages.conversation_id
        and chat_conversations.user_id = auth.uid()
    )
  );

create policy material_tag_relations_owner_all on public.material_tag_relations
  for all
  using (
    exists (
      select 1 from public.materials
      where materials.id = material_tag_relations.material_id
        and materials.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.materials
      where materials.id = material_tag_relations.material_id
        and materials.user_id = auth.uid()
    )
    and exists (
      select 1 from public.material_tags
      where material_tags.id = material_tag_relations.tag_id
        and material_tags.user_id = auth.uid()
    )
  );

create policy message_citations_owner_all on public.message_citations
  for all
  using (
    exists (
      select 1 from public.chat_messages
      where chat_messages.id = message_citations.message_id
        and chat_messages.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chat_messages
      where chat_messages.id = message_citations.message_id
        and chat_messages.user_id = auth.uid()
    )
    and (
      material_id is null
      or exists (
        select 1 from public.materials
        where materials.id = message_citations.material_id
          and materials.user_id = auth.uid()
      )
    )
  );

-- Client roles never receive platform session ciphertext. Later server-side APIs
-- can return an explicit safe status projection.
create policy platform_connections_owner_insert on public.platform_connections
  for insert with check (user_id = auth.uid());
create policy platform_connections_owner_update on public.platform_connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy platform_connections_owner_delete on public.platform_connections
  for delete using (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do update set public = false;

create policy materials_storage_read_own on storage.objects
  for select using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy materials_storage_insert_own on storage.objects
  for insert with check (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy materials_storage_update_own on storage.objects
  for update using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy materials_storage_delete_own on storage.objects
  for delete using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.knowledge_bases (user_id, name, type)
  values (new.id, '默认知识库', 'default');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
