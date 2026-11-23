-- Share links leave out archived titles (as well as Dropped ones).
create or replace function get_shared_list(share_token text)
returns table (
  media_type media_type, title text, year int, cover_url text, genres text[], ratings jsonb,
  progress progress_state, verdict verdict, favourite boolean, owned boolean,
  release_date date, byline text, sort_key int
)
language sql stable security definer set search_path = public as $$
  select t.media_type, t.title, t.year, t.cover_url, t.genres, t.ratings,
         i.progress, i.verdict, i.favourite, i.owned,
         t.release_date,
         coalesce(t.metadata->'authors'->>0, t.metadata->'developer'->>0) as byline,
         coalesce(ci.position, 0) as sort_key
  from share_links s
  join user_items i on i.user_id = s.user_id
  join titles t on t.id = i.title_id
  left join collection_items ci on ci.collection_id = s.collection_id and ci.user_item_id = i.id
  where s.token = share_token
    and s.revoked_at is null
    and i.progress <> 'dropped'
    and i.archived_at is null
    and (s.media_type is null or t.media_type = s.media_type)
    and (s.collection_id is null or ci.user_item_id is not null)
  order by coalesce(ci.position, 0), ci.added_at, i.updated_at desc
  limit 1000;
$$;
