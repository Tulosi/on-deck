# API sign-up checklist

All free. Keep every key/secret out of git — they go in Supabase (Edge Function secrets)
or GitHub (repository secrets), never in the frontend code.

Legend: **Where it goes** → `frontend` = GitHub repo secret (safe/public by design),
`server` = Supabase Edge Function secret (`supabase secrets set NAME=value`).

## 1. GitHub
- [ ] Create a repository named **`on-deck`** (public is required for free GitHub Pages).
- [ ] Repo → Settings → Pages → Source: **GitHub Actions**.
- Site will live at `https://<your-username>.github.io/on-deck/`.

## 2. Supabase
- [ ] Sign up at https://supabase.com and create a project (pick the region nearest you).
- [ ] Project Settings → API: copy **Project URL** and **anon / publishable key**.
  → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend)
- [ ] Authentication → Providers: make sure **Email** is enabled.
- [ ] Authentication → URL Configuration: Site URL = your GitHub Pages URL;
      add `http://localhost:5173` to Redirect URLs for local development.

## 3. Google sign-in
- [ ] https://console.cloud.google.com → create a project.
- [ ] APIs & Services → OAuth consent screen → External, fill in app name "On Deck".
- [ ] Credentials → Create OAuth client ID → Web application.
      Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
- [ ] Paste the Client ID + Secret into Supabase → Authentication → Providers → Google.

## 4. TMDB (movies + TV)
- [ ] Account at https://www.themoviedb.org → Settings → API → request a developer key.
- [ ] Copy the **API Read Access Token** (the long one). → `TMDB_READ_TOKEN` (server)

## 5. IGDB (games) — via Twitch
- [ ] Enable two-factor auth on a Twitch account (required).
- [ ] https://dev.twitch.tv/console/apps → Register application.
      OAuth Redirect URL: `http://localhost`, Category: Application Integration.
- [ ] Copy **Client ID** and generate a **Client Secret**.
  → `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (server)

## 6. OMDb (IMDb + Rotten Tomatoes scores)
- [ ] https://www.omdbapi.com/apikey.aspx → Free tier (1,000/day) → activate via email.
  → `OMDB_API_KEY` (server)

## 7. Hardcover (books)
- [ ] Account at https://hardcover.app → Settings → API → copy token.
  → `HARDCOVER_TOKEN` (server). Tokens expire; note the renewal date.

## 8. gg.deals (third-party game prices)
- [ ] Account at https://gg.deals → find the API section and request a key.
- [ ] Note the rate limits / terms (to be checked before we build on it).
  → `GGDEALS_API_KEY` (server)

## 9. Steam (optional for now)
- Store prices and review % come from public, keyless Steam endpoints.
- [ ] Only if we add Steam library import later: https://steamcommunity.com/dev/apikey
  → `STEAM_API_KEY` (server)

## Not needed up front
- **Plex / Seerr** — each user links these themselves in On Deck's Settings page.
