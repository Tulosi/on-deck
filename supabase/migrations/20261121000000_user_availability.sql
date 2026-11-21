-- Stored availability per user per title (movies / TV): on the user's Plex (via their Seerr) and on the
-- streaming services they opted in to, for their region. Written only by the `availability` Edge Function
-- (service role); users can read their own rows. Powers the Library's Availability filter, Home's
-- "Ready to start" and "Now available", and poster Plex dots.
create table user_availability (
  user_id               uuid not null references auth.users on delete cascade,
  title_id              uuid not null references titles on delete cascade,
  plex_status           text,             -- available | partial | processing | pending | missing; null = Plex/Seerr not set up
  streaming             text[] not null default '{}',  -- the user's services that have it (subscription or free)
  country               text,
  available             boolean not null default false, -- on Plex (fully/partly) or on one of the user's services
  available_changed_at  timestamptz,      -- when `available` last flipped
  became_available_at   timestamptz,      -- when it last went false → true
  checked_at            timestamptz not null default now(),
  primary key (user_id, title_id)
);

alter table user_availability enable row level security;

create policy "read own availability" on user_availability
  for select to authenticated using (user_id = auth.uid());

-- Explicit grants (this project doesn't auto-grant): users read, Edge Functions write.
grant select on user_availability to authenticated;
grant all on user_availability to service_role;
