-- Sidebar order (drag and drop), per user:
--   { "main": ["home","library","waitlist"], "types": ["movie","tv","game","book"], "collections": ["<id>", …] }
-- Missing keys / unknown entries fall back to the default order.
alter table profiles add column nav_layout jsonb not null default '{}';
