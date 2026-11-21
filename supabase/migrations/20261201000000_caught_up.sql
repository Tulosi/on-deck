-- Shows: "Caught up" = every aired episode watched, show still ongoing. The app moves shows between
-- In Progress and Caught up automatically as episodes air (docs/SPEC.md → Caught up).
alter type progress_state add value if not exists 'caught_up' after 'in_progress';
