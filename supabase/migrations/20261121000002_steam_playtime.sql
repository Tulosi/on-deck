-- Steam playtime per game, and a lock so the Steam check never overrides a status the user set themselves.
alter table user_items add column steam_playtime_minutes integer;
alter table user_items add column steam_last_played timestamptz;
-- Set whenever the user changes Status (Wanted / In Progress / …) themselves.
alter table user_items add column progress_locked boolean not null default false;
