-- Home → New for you: cards dismissed one at a time, as { user_item_id: dismissed-at ISO }. A dismissed title comes
-- back only with news dated after its dismissal. Entries older than the row's 7-day window are dropped on each write.
alter table profiles add column new_dismissed jsonb not null default '{}'::jsonb;
