-- Per-show switch for Plex watch sync (TV). true = "Watched up to" mirrors the user's Plex watch history;
-- false = the user overrode it manually for this show. Covered by the existing user_items grants and RLS.
alter table user_items add column plex_sync boolean not null default true;
