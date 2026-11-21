-- Steam account link (via Steam OpenID, verified server-side) and the ownership check.
-- profiles.steam_id / steam_name: written only by the `steam` Edge Function after verifying the sign-in
-- (users can read them through the existing "own profile" policy).
alter table profiles add column steam_id text;
alter table profiles add column steam_name text;

-- Set when the user changes "In Your Library" themselves, so the Steam ownership check never overrides them.
alter table user_items add column owned_locked boolean not null default false;
