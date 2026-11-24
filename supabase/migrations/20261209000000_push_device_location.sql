-- Where each push device was last seen, for Settings → Notifications ("Toronto, Ontario, 203.0.113.4").
-- Written only by the `push` function ({ action: 'seen' }), which reads the caller's IP from the request and
-- looks up its approximate city. Users can read their own rows (existing select grant) but not write these.
alter table push_subscriptions
  add column ip       text,
  add column city     text,
  add column region   text,
  add column country  text,
  add column seen_at  timestamptz;
