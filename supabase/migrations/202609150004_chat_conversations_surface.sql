-- Scope conversations to home vs knowledge-base chat surfaces.

alter table public.chat_conversations
  add column if not exists surface text not null default 'home'
    check (surface in ('home', 'knowledge')),
  add column if not exists knowledge_base_id uuid
    references public.knowledge_bases(id) on delete cascade;

create index if not exists chat_conversations_user_surface_updated_idx
  on public.chat_conversations (user_id, surface, updated_at desc);

create index if not exists chat_conversations_user_kb_updated_idx
  on public.chat_conversations (user_id, knowledge_base_id, updated_at desc)
  where knowledge_base_id is not null;
