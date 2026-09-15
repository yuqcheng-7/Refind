-- Capture display_name from auth signup metadata when creating profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '')
  );
  insert into public.knowledge_bases (user_id, name, type)
  values (new.id, '默认知识库', 'default');
  return new;
end;
$$;
