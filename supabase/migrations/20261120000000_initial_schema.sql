-- On Deck — initial schema
-- Shared title metadata is cached once per real-world title; everything personal hangs off user_items.
-- Row Level Security: users can only ever read/write their own rows. Shared/cache tables are written
-- only by Edge Functions (service role), which bypasses RLS.

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type media_type as enum ('movie', 'tv', 'game', 'book');
create type progress_state as enum ('wanted', 'in_progress', 'completed', 'dropped');
create type verdict as enum ('liked', 'disliked');
create type priority as enum ('high', 'medium', 'low');

-- ─── Profiles (one per auth user) ──────────────────────────────────────────
create table profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text,
  country_code text not null default 'US',   -- price region (ISO 3166-1 alpha-2)
  currency     text not null default 'USD',  -- ISO 4217
  seerr_url    text,                         -- user's own Seerr instance, https only
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Create a profile automatically on sign-up.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── Secrets that must never reach the browser ─────────────────────────────
-- RLS on, no policies → only Edge Functions (service role) can read/write.
-- TODO: move plex_token into Supabase Vault (vault.create_secret) when Plex linking is built.
create table user_integrations (
  user_id    uuid primary key references auth.users on delete cascade,
  plex_token text,
  plex_username text,
  linked_at  timestamptz
);

-- ─── Titles (shared metadata cache) ────────────────────────────────────────
create table titles (
  id           uuid primary key default gen_random_uuid(),
  media_type   media_type not null,
  source       text not null,            -- 'tmdb' | 'igdb' | 'hardcover'
  source_id    text not null,            -- id within that source
  title        text not null,
  year         int,
  cover_url    text,
  backdrop_url text,
  genres       text[] not null default '{}',
  external_ids jsonb not null default '{}',  -- { imdb_id, steam_appid, tmdb_id, ... }
  ratings      jsonb not null default '{}',  -- { imdb, rotten_tomatoes, steam_pct, hardcover }
  metadata     jsonb not null default '{}',  -- type-specific: seasons, coop modes, steam deck, hltb, author …
  release_date date,
  refreshed_at timestamptz not null default now(),
  unique (media_type, source, source_id)
);
create index titles_genres_idx on titles using gin (genres);

-- ─── Per-user tracking ─────────────────────────────────────────────────────
create table user_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  title_id        uuid not null references titles on delete cascade,
  owned           boolean not null default false,
  progress        progress_state not null default 'wanted',
  verdict         verdict,
  favourite       boolean not null default false,
  priority        priority,
  notes           text,
  current_season  int,
  current_episode int,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, title_id)
);
create index user_items_user_idx on user_items (user_id, progress);

-- ─── Collections (may mix media types) ─────────────────────────────────────
create table collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table collection_items (
  collection_id uuid not null references collections on delete cascade,
  user_item_id  uuid not null references user_items on delete cascade,
  position      int not null default 0,
  added_at      timestamptz not null default now(),
  primary key (collection_id, user_item_id)
);

-- ─── Read-only share links ─────────────────────────────────────────────────
-- Scope: whole library (both null), one media type, or one collection.
create table share_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  media_type    media_type,
  collection_id uuid references collections on delete cascade,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

-- ─── Game price cache (written by the daily refresh job) ───────────────────
create table game_prices (
  title_id          uuid not null references titles on delete cascade,
  country_code      text not null,
  currency          text not null,
  steam_price       numeric(10, 2),
  steam_discount    int,
  best_price        numeric(10, 2),
  best_shop         text,
  best_url          text,
  historical_low    numeric(10, 2),
  fetched_at        timestamptz not null default now(),
  primary key (title_id, country_code)
);

-- ─── updated_at bookkeeping ────────────────────────────────────────────────
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();
create trigger user_items_touch before update on user_items for each row execute function touch_updated_at();

-- ─── Row Level Security ────────────────────────────────────────────────────
alter table profiles          enable row level security;
alter table user_integrations enable row level security;
alter table titles            enable row level security;
alter table user_items        enable row level security;
alter table collections       enable row level security;
alter table collection_items  enable row level security;
alter table share_links       enable row level security;
alter table game_prices       enable row level security;

create policy "own profile" on profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Shared caches: any signed-in user can read; only Edge Functions write.
create policy "read titles" on titles for select to authenticated using (true);
create policy "read prices" on game_prices for select to authenticated using (true);

create policy "own items" on user_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own collections" on collections
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own collection items" on collection_items
  for all to authenticated
  using (exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (
    exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid())
    and exists (select 1 from user_items i where i.id = user_item_id and i.user_id = auth.uid())
  );

create policy "own share links" on share_links
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Public read of a shared list ──────────────────────────────────────────
-- Anonymous visitors call this with a token; it returns only that link's items and never notes.
create function get_shared_list(share_token text)
returns table (
  media_type media_type, title text, year int, cover_url text, genres text[], ratings jsonb,
  progress progress_state, verdict verdict, favourite boolean, owned boolean
)
language sql stable security definer set search_path = public as $$
  select t.media_type, t.title, t.year, t.cover_url, t.genres, t.ratings,
         i.progress, i.verdict, i.favourite, i.owned
  from share_links s
  join user_items i on i.user_id = s.user_id
  join titles t on t.id = i.title_id
  where s.token = share_token
    and s.revoked_at is null
    and (s.media_type is null or t.media_type = s.media_type)
    and (s.collection_id is null or exists (
          select 1 from collection_items ci
          where ci.collection_id = s.collection_id and ci.user_item_id = i.id))
  order by i.updated_at desc;
$$;
grant execute on function get_shared_list(text) to anon, authenticated;
