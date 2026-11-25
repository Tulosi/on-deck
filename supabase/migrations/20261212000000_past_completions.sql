-- Start again (rewatch / replay / reread): earlier finish dates, oldest first. Starting a finished title again moves
-- its completed_at here, so the times through and when aren't lost. Empty = finished at most once.
alter table user_items add column past_completions timestamptz[] not null default '{}';
