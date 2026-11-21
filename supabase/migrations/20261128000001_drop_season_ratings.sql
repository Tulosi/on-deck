-- Per-season ratings were dropped in favour of a single show rating (Home prompts after a finished season).
alter table user_items drop column if exists season_ratings;
