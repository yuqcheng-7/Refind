create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notebook_id uuid references public.notebooks(id) on delete set null,
  title text,
  content jsonb not null default '{"text":"","blocks":[],"sections":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inspiration_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_snapshot text not null,
  source_question_snapshot text,
  answer_mode text not null check (answer_mode in ('general', 'rag')),
  source_message_id uuid references public.chat_messages(id) on delete set null,
  source_conversation_id uuid references public.chat_conversations(id) on delete set null,
  source_knowledge_base_ids jsonb,
  citation_snapshot jsonb,
  selection_start integer check (selection_start is null or selection_start >= 0),
  selection_end integer check (selection_end is null or selection_end >= 0),
  created_at timestamptz not null default now(),
  check (
    selection_start is null
    or selection_end is null
    or selection_end >= selection_start
  )
);

create table public.note_inspiration_cards (
  note_id uuid not null references public.notes(id) on delete cascade,
  inspiration_card_id uuid not null references public.inspiration_cards(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  user_thought text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (note_id, inspiration_card_id)
);

create table public.note_revisions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title_snapshot text,
  content_snapshot jsonb not null,
  reason text not null default 'before_generate' check (reason = 'before_generate'),
  created_at timestamptz not null default now()
);

create table public.note_knowledge_base_materials (
  note_id uuid not null references public.notes(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (note_id, knowledge_base_id),
  unique (material_id)
);

create index notes_user_updated_at_idx on public.notes (user_id, updated_at desc);
create index notes_notebook_id_idx on public.notes (notebook_id);
create index inspiration_cards_user_created_at_idx on public.inspiration_cards (user_id, created_at desc);
create index note_inspiration_cards_card_id_idx on public.note_inspiration_cards (inspiration_card_id);
create index note_revisions_note_created_at_idx on public.note_revisions (note_id, created_at desc);

create trigger notebooks_set_updated_at before update on public.notebooks
  for each row execute function public.set_updated_at();
create trigger notes_set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();
create trigger note_inspiration_cards_set_updated_at before update on public.note_inspiration_cards
  for each row execute function public.set_updated_at();
create trigger note_knowledge_base_materials_set_updated_at before update on public.note_knowledge_base_materials
  for each row execute function public.set_updated_at();

alter table public.notebooks enable row level security;
alter table public.notes enable row level security;
alter table public.inspiration_cards enable row level security;
alter table public.note_inspiration_cards enable row level security;
alter table public.note_revisions enable row level security;
alter table public.note_knowledge_base_materials enable row level security;

create policy notebooks_owner_all on public.notebooks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notes_owner_all on public.notes
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (
      notebook_id is null
      or exists (
        select 1 from public.notebooks
        where notebooks.id = notes.notebook_id
          and notebooks.user_id = auth.uid()
      )
    )
  );
create policy inspiration_cards_owner_all on public.inspiration_cards
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (
      source_message_id is null
      or exists (
        select 1 from public.chat_messages
        where chat_messages.id = inspiration_cards.source_message_id
          and chat_messages.user_id = auth.uid()
      )
    )
    and (
      source_conversation_id is null
      or exists (
        select 1 from public.chat_conversations
        where chat_conversations.id = inspiration_cards.source_conversation_id
          and chat_conversations.user_id = auth.uid()
      )
    )
  );

create policy note_inspiration_cards_owner_all on public.note_inspiration_cards
  for all
  using (
    exists (
      select 1 from public.notes
      where notes.id = note_inspiration_cards.note_id
        and notes.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.notes
      where notes.id = note_inspiration_cards.note_id
        and notes.user_id = auth.uid()
    )
    and exists (
      select 1 from public.inspiration_cards
      where inspiration_cards.id = note_inspiration_cards.inspiration_card_id
        and inspiration_cards.user_id = auth.uid()
    )
  );

create policy note_revisions_owner_all on public.note_revisions
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.notes
      where notes.id = note_revisions.note_id
        and notes.user_id = auth.uid()
    )
  );

create policy note_knowledge_base_materials_owner_all on public.note_knowledge_base_materials
  for all
  using (
    exists (
      select 1 from public.notes
      where notes.id = note_knowledge_base_materials.note_id
        and notes.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.notes
      where notes.id = note_knowledge_base_materials.note_id
        and notes.user_id = auth.uid()
    )
    and exists (
      select 1 from public.knowledge_bases
      where knowledge_bases.id = note_knowledge_base_materials.knowledge_base_id
        and knowledge_bases.user_id = auth.uid()
    )
    and exists (
      select 1 from public.materials
      where materials.id = note_knowledge_base_materials.material_id
        and materials.user_id = auth.uid()
        and materials.knowledge_base_id = note_knowledge_base_materials.knowledge_base_id
    )
  );

create or replace function public.replace_note_inspiration_cards(
  p_note_id uuid,
  p_rows jsonb
)
returns table (
  inspiration_card_id uuid,
  sort_order integer,
  user_thought text
)
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.notes
    where notes.id = p_note_id
      and notes.user_id = auth.uid()
  ) then
    raise exception 'Note not found or access denied.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array.';
  end if;

  delete from public.note_inspiration_cards
  where note_id = p_note_id;

  return query
  insert into public.note_inspiration_cards (
    note_id,
    inspiration_card_id,
    sort_order,
    user_thought
  )
  select
    p_note_id,
    rows.inspiration_card_id,
    rows.sort_order,
    rows.user_thought
  from jsonb_to_recordset(p_rows) as rows(
    inspiration_card_id uuid,
    sort_order integer,
    user_thought text
  )
  returning
    note_inspiration_cards.inspiration_card_id,
    note_inspiration_cards.sort_order,
    note_inspiration_cards.user_thought;
end;
$$;
