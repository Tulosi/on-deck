-- Import pickers (Steam / Plex): titles the user chose not to import, so a later re-import leaves them unticked.
-- key = the title's source key ("game:igdb:123", "tv:tmdb:456").
create table import_skips (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  key         text not null,
  skipped_at  timestamptz not null default now(),
  primary key (user_id, key)
);
alter table import_skips enable row level security;
create policy "own import skips" on import_skips
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on import_skips to authenticated;
grant all on import_skips to service_role;
