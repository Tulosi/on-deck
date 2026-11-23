-- Plex sync writes (they set plex_checked_at) don't stamp now(): plex-watch already saved Plex's real watch time,
-- and the sync may run hours after the watch.
create or replace function stamp_last_activity() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.last_activity_at = coalesce(new.last_activity_at, now());
  elsif new.last_activity_at is not distinct from old.last_activity_at
    and new.plex_checked_at is not distinct from old.plex_checked_at
    and (new.progress is distinct from old.progress
      or new.current_season is distinct from old.current_season
      or new.current_episode is distinct from old.current_episode) then
    new.last_activity_at = now();
  end if;
  if new.steam_last_played is not null
    and (new.last_activity_at is null or new.steam_last_played > new.last_activity_at) then
    new.last_activity_at = new.steam_last_played;
  end if;
  return new;
end $$;
