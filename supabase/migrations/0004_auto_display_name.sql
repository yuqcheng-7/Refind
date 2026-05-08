-- Update handle_new_user to auto-generate display_name from email prefix on signup.
-- Uses coalesce so existing display_names (user-edited) are not overwritten.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _display_name text;
begin
  -- e.g. "zhangsan@example.com" → "zhangsan"
  _display_name := split_part(new.email, '@', 1);

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, _display_name)
  on conflict (id) do update
    set email = excluded.email,
        -- only backfill display_name if it hasn't been set yet
        display_name = coalesce(profiles.display_name, excluded.display_name);
  return new;
end;
$$;

-- Re-create the trigger (idempotent)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
