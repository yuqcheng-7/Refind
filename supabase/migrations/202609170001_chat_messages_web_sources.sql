-- Persist network search sources for home general+online answers (history replay).
alter table public.chat_messages
  add column if not exists web_sources jsonb;

comment on column public.chat_messages.web_sources is
  'Optional web search sources [{order,title,url}] for general+online answers';
