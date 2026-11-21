-- Game prices per title per region (shared cache, written by the `prices` Edge Function; signed-in users read).
-- See docs/SPEC.md → Game pricing.
--   official_*: cheapest offer from Steam or a store selling a Steam key (IsThereAnyDeal)
--   steam_regular: Steam's own full price — every discount % is measured against it
--   keyshop_*: cheapest key-shop offer (gg.deals)
alter table game_prices
  add column is_free          boolean not null default false,
  add column official_shop    text,
  add column official_price   numeric(10, 2),
  add column official_url     text,
  add column official_low     numeric(10, 2),   -- lowest-ever across Steam-key stores
  add column steam_regular    numeric(10, 2),
  add column keyshop_price    numeric(10, 2),
  add column keyshop_low      numeric(10, 2),   -- lowest-ever key-shop price
  add column keyshop_url      text;
-- (Existing grants: authenticated may select, service_role writes. RLS policy "read prices" already allows reads.)
