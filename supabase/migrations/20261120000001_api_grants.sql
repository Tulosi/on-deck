-- Explicit table privileges for the API roles.
-- This Supabase project does not auto-grant privileges on new tables, so every table needs its
-- grants spelled out. Row Level Security (initial schema) still decides which ROWS each user sees;
-- these grants only decide which OPERATIONS a role may attempt at all.
--
--   anon          → nothing (shared lists go through the get_shared_list() function)
--   authenticated → full CRUD on their own data; read-only on shared caches
--   service_role  → everything (Edge Functions; bypasses RLS)
--
-- Every new table added in later migrations must get its own grants here-style.

grant usage on schema public to anon, authenticated, service_role;

-- Signed-in users: their own data (RLS limits rows to user_id = auth.uid()).
grant select, insert, update, delete on
  user_items, collections, collection_items, share_links
to authenticated;

-- Profiles are created by the sign-up trigger; users may read and edit, not create or delete.
grant select, update on profiles to authenticated;

-- Shared caches: read-only for users, written by Edge Functions.
grant select on titles, game_prices to authenticated;

-- user_integrations (Plex tokens): deliberately NO grant to anon/authenticated.

-- Edge Functions.
grant all on all tables in schema public to service_role;
