-- Streaming services each user opts in to (Settings → Streaming services).
-- Stored as normalised service names ("Netflix", "Shudder" …) — add-on channels such as
-- "Shudder Amazon Channel" are merged into their service before matching.
-- Covered by the existing profiles grants (select, update) and the "own profile" RLS policy.
alter table profiles add column streaming_services text[] not null default '{}';
