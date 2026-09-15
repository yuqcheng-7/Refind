-- Move single-KB RAG threads that were stored as home into knowledge history.
-- Only reclassify conversations whose assistant citations all point at one knowledge base.

with cited as (
  select
    m.conversation_id,
    c.knowledge_base_name_snapshot as kb_name
  from public.chat_messages m
  join public.message_citations c on c.message_id = m.id
  where m.role = 'assistant'
),
single_kb as (
  select
    conversation_id,
    min(kb_name) as kb_name
  from cited
  group by conversation_id
  having count(distinct kb_name) = 1
),
mapped as (
  select
    sk.conversation_id,
    kb.id as knowledge_base_id
  from single_kb sk
  join public.chat_conversations cc on cc.id = sk.conversation_id
  join public.knowledge_bases kb
    on kb.name = sk.kb_name
   and kb.user_id = cc.user_id
  where cc.surface = 'home'
    and cc.knowledge_base_id is null
)
update public.chat_conversations cc
set
  surface = 'knowledge',
  knowledge_base_id = mapped.knowledge_base_id
from mapped
where cc.id = mapped.conversation_id;
