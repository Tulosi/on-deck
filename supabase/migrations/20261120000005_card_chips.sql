-- Per-user display setting for poster chips: { "<chip>": "show" | "hover" | "hide" }.
-- Chips not listed use the default ("show"). Covered by the existing profiles grants and RLS.
alter table profiles add column card_chips jsonb not null default '{}';
