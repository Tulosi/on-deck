# API sign-up checklist

All free. Keep every key/secret out of git — they go in Supabase (Edge Function secrets)
or GitHub (repository secrets), never in the frontend code.

Legend: **Where it goes** → `frontend` = GitHub repo secret (safe/public by design),
`server` = Supabase Edge Function secret.

To add a server secret (run from the project folder; the CLI is already linked):

```bash
npx supabase secrets set NAME=value
```

## Status

| Service | Status | Secret(s) |
|---|---|---|
| GitHub | ✅ Done | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (repo secrets) |
| Supabase | ✅ Done | — |
| TMDB | ✅ Done | `TMDB_READ_TOKEN` |
| IGDB (via Twitch) | ✅ Done | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| OMDb | ⬜ To do | `OMDB_API_KEY` |
| Hardcover | ⬜ To do | `HARDCOVER_TOKEN` |
| gg.deals | ⬜ To do | `GGDEALS_API_KEY` |
| Steam | Optional | `STEAM_API_KEY` (only for library import) |

## 1. GitHub ✅
- [x] Repository: **https://github.com/Tulosi/on-deck** (public, required for free GitHub Pages).
- [x] Settings → Pages → Source: **GitHub Actions**.
- [x] Repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` added
      (Settings → Secrets and variables → Actions).
- Live site: **https://tulosi.github.io/on-deck/** — redeploys on every push to `main`.

## 2. Supabase ✅
- [x] Project **On Deck Database** — `https://fctzvjktqqsgfpfrcdgk.supabase.co`
      ([dashboard](https://supabase.com/dashboard/project/fctzvjktqqsgfpfrcdgk)).
- [x] Publishable key in the GitHub repo secrets and the local `.env.local` (gitignored).
- [x] Authentication → Providers: **Email** enabled.
- [x] Authentication → [URL Configuration](https://supabase.com/dashboard/project/fctzvjktqqsgfpfrcdgk/auth/url-configuration):
      Site URL `https://tulosi.github.io/on-deck/`; Redirect URLs `https://tulosi.github.io/on-deck/**`
      and `http://localhost:5173/**`.
- [x] Database schema applied (`npx supabase db push --remote`).
- [x] CLI signed in and linked on this Mac.
- The **secret key** (`sb_secret_…`) is never needed by the app — Edge Functions get it automatically.
  Don't paste it anywhere.

## 3. TMDB (movies + TV) ✅
- [x] API Read Access Token saved as `TMDB_READ_TOKEN` (server). Powers movie/TV search.
- To replace it: themoviedb.org → Settings → API, then `npx supabase secrets set TMDB_READ_TOKEN=…`.

## 4. IGDB (games) — via Twitch ✅
- [x] Twitch app registered at https://dev.twitch.tv/console/apps as **`Tulos_OnDeck`**
      (`On Deck` was taken). OAuth Redirect URL `http://localhost` — a required placeholder; IGDB uses
      app-only (client credentials) auth, so no user is ever redirected.
- [x] `TWITCH_CLIENT_ID` saved (server).
- [x] `TWITCH_CLIENT_SECRET` (server). To replace it, run this in Terminal (keeps it off screen and out of shell history):
  ```bash
  cd ~/Desktop/"On Deck" && read -rs "S?Twitch client secret: " && echo && npx supabase secrets set TWITCH_CLIENT_SECRET="$S"; unset S
  ```

## 5. OMDb (IMDb + Rotten Tomatoes scores)
- [ ] https://www.omdbapi.com/apikey.aspx → Free tier (1,000/day) → activate via email.
  → `OMDB_API_KEY` (server)

## 6. Hardcover (books)
- [ ] Account at https://hardcover.app → Settings → API → copy token.
  → `HARDCOVER_TOKEN` (server). Tokens expire; note the renewal date.

## 7. gg.deals (third-party game prices)
- [ ] Account at https://gg.deals → find the API section and request a key.
- [ ] Note the rate limits / terms (to be checked before we build on it).
  → `GGDEALS_API_KEY` (server)

## 8. Steam (optional for now)
- Store prices, review % and Early Access status come from public, keyless Steam endpoints.
- [ ] Only if we add Steam library import later: https://steamcommunity.com/dev/apikey
      (domain: `tulosi.github.io`) → `STEAM_API_KEY` (server)

## Not needed up front
- **Plex / Seerr** — each user links these themselves in On Deck's Settings page.
- **Custom SMTP** — optional. Lifts Supabase's few-emails-per-hour limit on sign-up
  and reset emails (e.g. Brevo free tier or a Gmail app password).
