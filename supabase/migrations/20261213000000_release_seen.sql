-- The release events (premieres, launches, 1.0, book dates) the daily job last saw for each title, keyed by event
-- ("release", "season-s3" …). The job compares today's events against this to write "announced" / "date moved"
-- alerts, so a change is caught even when the app refreshed the title first. Null = not seen yet (recorded
-- silently on the next run). Written only by the daily job; the title functions' upserts leave it alone.
alter table titles add column release_seen jsonb;
