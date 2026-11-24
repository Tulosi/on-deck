-- "Not now" on Home's "Pick it back up?" row: the title stays out of that row until this time, on every device.
-- Null = not snoozed. Only the row reads it; the title's status is unchanged.
alter table user_items add column snoozed_until timestamptz;
