-- Soft-deleted materials must not block re-import of the same canonical URL.
drop index if exists public.materials_unique_canonical_url_per_knowledge_base;

create unique index materials_unique_canonical_url_per_knowledge_base
  on public.materials (knowledge_base_id, canonical_url)
  where canonical_url is not null and status <> 'deleted';
