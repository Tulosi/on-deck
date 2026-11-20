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
| MDBList | ✅ Done | `MDBLIST_API_KEY` |
| OMDb | ✅ Done (fallback) | `OMDB_API_KEY` |
| Hardcover | ✅ Done (token expires — see below) | `HARDCOVER_TOKEN` |
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

## 5. Review scores — MDBList (primary) + OMDb (fallback) ✅
- [x] **MDBList** free key (1,000 requests/day) saved as `MDBLIST_API_KEY` (server). One lookup returns IMDb
      and Rotten Tomatoes critics + audience (Metacritic/Letterboxd are available but not used for movies/TV). Key: https://mdblist.com/preferences/#api
- [x] **OMDb** free key (1,000 requests/day) saved as `OMDB_API_KEY` (server). Only used if MDBList fails or
      runs out of quota — its Rotten Tomatoes data is patchy for recent movies and missing for most TV.
- Scores are cached on each title (re-checked daily until a title has an IMDb score, then weekly), so the
  daily limits only matter when lots of new titles are added.
- To replace either: `npx supabase secrets set MDBLIST_API_KEY=…` / `OMDB_API_KEY=…`.

## 6. Hardcover (books) ✅
- [x] Personal access token (read-only catalogue access is all On Deck needs) saved as `HARDCOVER_TOKEN` (server).
- **Tokens expire.** Expiry date: _(fill in from hardcover.app → Settings → API)_. When it lapses, book
  search stops working until a new token is set.
- Hardcover's terms: server-side use only (never in the browser) — On Deck only calls it from an Edge Function.
- To replace it, run in Terminal (keeps it off screen and out of shell history):
  ```bash
  cd ~/Desktop/"On Deck" && read -rs "S?Hardcover token: " && echo && npx supabase secrets set HARDCOVER_TOKEN="$S"; unset S
  ```

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
