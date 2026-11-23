-- Group B (docs/ROADMAP.md): a Stalled status for games and books, and Archive for any title.
--   stalled_at: when it was last set to Stalled (Home's "Pick it back up?" shows the last 3 months)
--   archived_at: set = archived. Archived titles are hidden by default everywhere, get no alerts, and are left
--   out of share links.
alter type progress_state add value if not exists 'stalled' after 'caught_up';
alter table user_items add column stalled_at timestamptz;
alter table user_items add column archived_at timestamptz;
