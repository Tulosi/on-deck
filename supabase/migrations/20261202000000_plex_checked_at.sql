-- When the `daily` job last read Plex watch history for this item, so each run checks the oldest ones first.
alter table user_items add column plex_checked_at timestamptz;
