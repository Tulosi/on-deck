-- Web Push subscriptions: one row per browser / device that turned on push (Settings → Notifications).
-- The `daily` job sends each new alert to every subscription of its user and deletes ones the push service
-- reports as gone (404 / 410).
create table push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  device        text,             -- e.g. "iPhone · Safari", for the settings list
  created_at    timestamptz not null default now(),
  last_push_at  timestamptz
);
create index push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
create policy "read own push subscriptions" on push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "add own push subscriptions" on push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "remove own push subscriptions" on push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Explicit grants (this project doesn't auto-grant).
grant select, delete on push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth, device) on push_subscriptions to authenticated;
grant all on push_subscriptions to service_role;
