-- Per-season overrides for TV completion: { "<season number>": "watched" | "unwatched" | "ignored" }.
-- Seasons not listed are "auto" (derived from the Progress pointer / Plex sync).
-- Covered by the existing user_items grants and RLS.
alter table user_items add column season_overrides jsonb not null default '{}';
