-- Ongoing Steam sync (docs/ROADMAP.md → Group F2): when on, games newly found in the user's Steam library are
-- offered on Home ("Add to On Deck?").
--   steam_sync: the user's switch (Settings → Steam).
--   steam_seen_appids: Steam app ids already accounted for (present when sync was switched on, answered, already
--   in the library, or not on IGDB). Null = take a fresh baseline on the next check, so switching sync on never
--   floods Home with the whole back catalogue.
-- Covered by the existing profiles grants (select, update) and the "own profile" RLS policy.
alter table profiles add column steam_sync boolean not null default false;
alter table profiles add column steam_seen_appids text[];
