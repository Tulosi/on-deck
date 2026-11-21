-- Read-only share links (docs/SPEC.md → Sharing). Anonymous visitors call these two functions with a token;
-- nothing else is readable without signing in. Neither returns notes, priorities, emails or ids.

-- The list itself: titles in the link's scope (whole library, one type, or one collection), Dropped left out.
drop function if exists get_shared_list(text);
create function get_shared_list(share_token text)
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
         -- Collections keep their own order; otherwise most recently changed first.
         coalesce(ci.position, 0) as sort_key
  from share_links s
  join user_items i on i.user_id = s.user_id
  join titles t on t.id = i.title_id
  left join collection_items ci on ci.collection_id = s.collection_id and ci.user_item_id = i.id
  where s.token = share_token
    and s.revoked_at is null
    and i.progress <> 'dropped'
    and (s.media_type is null or t.media_type = s.media_type)
    and (s.collection_id is null or ci.user_item_id is not null)
  order by coalesce(ci.position, 0), ci.added_at, i.updated_at desc
  limit 1000;
$$;

-- What the link is: for the page header ("Games", or a collection's name and description).
create function get_share_info(share_token text)
returns table (media_type media_type, collection_name text, collection_description text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.media_type, c.name, c.description, s.created_at
  from share_links s
  left join collections c on c.id = s.collection_id
  where s.token = share_token and s.revoked_at is null;
$$;

revoke all on function get_shared_list(text) from public;
revoke all on function get_share_info(text) from public;
grant execute on function get_shared_list(text) to anon, authenticated;
grant execute on function get_share_info(text) to anon, authenticated;
