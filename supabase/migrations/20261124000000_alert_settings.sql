-- Which kinds of game-price alerts a user wants (Settings → Notifications). Missing keys mean "on".
--   { "price_low": true|false, "deep_discount": true|false }
alter table profiles add column alert_settings jsonb not null default '{}';
