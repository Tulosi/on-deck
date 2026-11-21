-- Home → "New for you" shows what changed since the user's previous visit (docs/HOME.md).
alter table profiles add column last_seen_home_at timestamptz;
