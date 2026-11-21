-- "Not now" on Home's rating prompts (season_ratings was added here, then dropped in 20261128000001).
--   season_ratings: { "2": "liked" | "disliked" }
--   rating_skipped: prompts the user dismissed, e.g. {"title", "s2"}
alter table user_items add column season_ratings jsonb not null default '{}';
alter table user_items add column rating_skipped text[] not null default '{}';
