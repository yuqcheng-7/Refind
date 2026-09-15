-- Security fix: bind filter_user to auth.uid() unless caller is service_role.
-- Remote projects that already applied 202609150002 need this replace.

create or replace function public.match_material_chunks(
  query_embedding vector(1024),
  match_count int,
  filter_user uuid,
  filter_kb_ids uuid[] default null,
  filter_tag_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  material_id uuid,
  knowledge_base_id uuid,
  content text,
  similarity float,
  material_title text,
  knowledge_base_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as chunk_id,
    c.material_id,
    c.knowledge_base_id,
    c.content,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    m.title as material_title,
    kb.name as knowledge_base_name
  from public.material_chunks c
  join public.materials m on m.id = c.material_id
  join public.knowledge_bases kb on kb.id = c.knowledge_base_id
  where m.user_id = filter_user
    and (
      coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or filter_user = auth.uid()
    )
    and m.status = 'ready'
    and c.embedding is not null
    and (filter_kb_ids is null or cardinality(filter_kb_ids) = 0 or c.knowledge_base_id = any(filter_kb_ids))
    and (
      filter_tag_ids is null
      or cardinality(filter_tag_ids) = 0
      or (
        select count(distinct r.tag_id)
        from public.material_tag_relations r
        where r.material_id = c.material_id
          and r.tag_id = any(filter_tag_ids)
      ) = cardinality(filter_tag_ids)
    )
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 8), 50));
$$;

revoke all on function public.match_material_chunks(vector, int, uuid, uuid[], uuid[]) from public;
grant execute on function public.match_material_chunks(vector, int, uuid, uuid[], uuid[]) to authenticated, service_role;
