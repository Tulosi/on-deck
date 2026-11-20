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

Requires the Supabase CLI (`brew install supabase/tap/supabase`).

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                     # apply migrations
supabase secrets set TMDB_READ_TOKEN=…   # repeat for each server secret in .env.example
supabase functions deploy            # deploy all Edge Functions
```

## Deploy

Push to `main` on a GitHub repo named `on-deck` with Pages set to "GitHub Actions".
Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets.
