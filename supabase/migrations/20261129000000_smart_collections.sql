-- Smart collections: `rules` holds Library filters + sort in the Library's URL format
-- (e.g. "type=game&length=short&deal=on_sale&sort=price"). Null = a hand-picked collection.
-- The app keeps a smart collection's collection_items in step with its rules, so counts and share links work.
alter table collections add column rules text;
