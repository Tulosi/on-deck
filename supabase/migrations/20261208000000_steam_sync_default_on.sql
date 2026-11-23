-- "Ask about new Steam games" is on by default once Steam is linked (the `steam` function now sets it when
-- linking). Turn it on for accounts linked before that, unless the user has ever had it on: a non-null
-- steam_seen_appids means it was switched on at some point, so leave their choice alone.
update profiles
set steam_sync = true
where steam_id is not null
  and steam_sync = false
  and steam_seen_appids is null;
