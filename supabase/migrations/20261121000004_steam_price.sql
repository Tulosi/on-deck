-- Steam's own price is now always shown first (read straight from the Steam store per region).
-- steam_price / steam_discount already exist; add Steam's lowest-ever price for the "Historical low" tag.
-- official_* now means "cheapest *other* store selling a Steam key" (shown only when cheaper than Steam).
alter table game_prices add column steam_low numeric(10, 2);
