-- Private calendar feed (.ics) per user. The token in the feed URL is the only credential, so it's long and
-- random; users can delete the row to revoke the link and insert a new one to get a fresh link.
-- Served by the `calendar` Edge Function (service role), which looks the user up by token.
create table calendar_feeds (
  user_id     uuid primary key references auth.users on delete cascade,
  token       text not null unique
              default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now()
);

alter table calendar_feeds enable row level security;

create policy "read own feed" on calendar_feeds
  for select to authenticated using (user_id = auth.uid());
create policy "create own feed" on calendar_feeds
  for insert to authenticated with check (user_id = auth.uid());
create policy "revoke own feed" on calendar_feeds
  for delete to authenticated using (user_id = auth.uid());

-- Explicit grants (this project doesn't auto-grant). Users can only insert user_id, so the token always
-- comes from the database's random default.
grant select, delete on calendar_feeds to authenticated;
grant insert (user_id) on calendar_feeds to authenticated;
grant all on calendar_feeds to service_role;
