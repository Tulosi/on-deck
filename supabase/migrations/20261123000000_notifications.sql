-- Notifications (docs/SPEC.md → Notifications). Written by the `daily` Edge Function; users read their own and
-- mark them read. `dedup_key` makes each alert happen once per user (e.g. "out:<title>:release:2026-12-15").
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title_id    uuid references titles on delete cascade,
  kind        text not null,   -- release_day | week_before | date_changed | announced | available | price_low
  message     text not null,   -- ready-to-show text, e.g. "Out today: Dune: Part Three"
  payload     jsonb not null default '{}',
  dedup_key   text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  unique (user_id, dedup_key)
);
create index notifications_user_recent on notifications (user_id, created_at desc);

alter table notifications enable row level security;
create policy "read own notifications" on notifications
  for select to authenticated using (user_id = auth.uid());
create policy "mark own notifications read" on notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own notifications" on notifications
  for delete to authenticated using (user_id = auth.uid());

-- Explicit grants (this project doesn't auto-grant). Users may only change read_at.
grant select, delete on notifications to authenticated;
grant update (read_at) on notifications to authenticated;
grant all on notifications to service_role;

-- Per-title "Notify me" (on by default; release alerts are only about titles you haven't dropped).
alter table user_items add column notify boolean not null default true;

-- The user's IANA time zone (set by the app), so "out today" follows their day, not UTC.
alter table profiles add column timezone text;

-- When the daily job last ran for each user (it only alerts about availability that changed since then).
alter table profiles add column daily_checked_at timestamptz;
