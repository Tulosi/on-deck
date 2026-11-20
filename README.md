# On Deck

The movies, TV shows, games and books you actually intend to get to.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- API sign-up checklist: [docs/API-KEYS.md](docs/API-KEYS.md)

## Run locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173. Without Supabase keys the app runs in **preview mode** on sample data.
To connect Supabase, copy `.env.example` to `.env.local` and fill in the two `VITE_` values.

## Project layout

```
src/
  components/   App shell, sidebar, top bar, poster card/row
  pages/        Home, category grids, title page, collections, settings, login, shared list
  lib/          Supabase client, theme toggle
  types/        Shared domain types (mirror the database schema)
  data/         Sample data for preview mode — delete once real data flows
supabase/
  migrations/   Database schema + Row Level Security
  functions/    Edge Functions — one per external API (stubs for now)
.github/workflows/deploy.yml   Build + publish to GitHub Pages on push to main
```

## Backend (Supabase)

The Supabase CLI is a dev dependency, so it runs through `npx` (no Homebrew install needed).
`supabase login` must be run once in a real terminal (it asks for a code from the browser).

```bash
npx supabase login
npx supabase link --project-ref fctzvjktqqsgfpfrcdgk
npx supabase db push --remote                  # apply new migrations to the hosted DB
npx supabase secrets set TMDB_READ_TOKEN=…     # repeat for each server secret in .env.example
npx supabase functions deploy                  # deploy all Edge Functions
```

**New tables need explicit grants.** This project doesn't auto-grant table privileges to the
API roles, so every migration that creates a table must also grant access to it
(see `supabase/migrations/20261120000001_api_grants.sql`). Without that, the table returns
"permission denied" even for signed-in users.

## Deploy

Push to `main` on a GitHub repo named `on-deck` with Pages set to "GitHub Actions".
Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets.
