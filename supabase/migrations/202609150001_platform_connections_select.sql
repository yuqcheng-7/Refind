-- Allow owners to read their own platform connection rows.
-- Needed for upsert().select() and settings list; demo session marker is non-secret.
-- Later: expose a safe view that omits encrypted_session when real sessions ship.

create policy platform_connections_owner_select on public.platform_connections
  for select using (user_id = auth.uid());
