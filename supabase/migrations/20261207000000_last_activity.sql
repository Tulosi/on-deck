-- When the user last actually did something with a title, for Home's Continue order. updated_at can't be used:
-- background jobs touch it (e.g. the Plex check stamps plex_checked_at every few hours).
--   • Status, season or episode changes (by the user, or by Plex sync moving them) → now().
--   • A caller can set it explicitly (plex-watch sets Plex's real "last watched" time); that value is kept.
--   • Steam playtime: Steam's "last played" time, when it's later.
alter table user_items add column last_activity_at timestamptz;

create function stamp_last_activity() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.last_activity_at = coalesce(new.last_activity_at, now());
  elsif new.last_activity_at is not distinct from old.last_activity_at
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

create trigger user_items_last_activity before insert or update on user_items
  for each row execute function stamp_last_activity();

-- Backfill: the best we know without updated_at (Steam last played, when started, when added).
update user_items set last_activity_at = greatest(steam_last_played, started_at, completed_at, created_at);
