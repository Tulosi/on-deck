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
| IsThereAnyDeal | ✅ Done | `ITAD_API_KEY` |
| gg.deals | ⚠️ Key done — **to do: one GitHub secret** (see below) | `GGDEALS_API_KEY` (Supabase + GitHub), `SUPABASE_SECRET_KEY` (GitHub, not added yet) |
| Steam | ✅ Done | `STEAM_API_KEY` (ownership check only) |

## ⚠️ To do: key-shop prices

Key-shop prices ("Cheaper on key shops") come from gg.deals. gg.deals doesn't answer Supabase's servers,
so a scheduled GitHub job fetches them instead (`.github/workflows/keyshop-prices.yml`, every 6 hours).
To save prices it needs a Supabase secret key. **Until you add it, the job skips** (each run shows a
"not set up yet" notice) and key-shop rows stay empty. Everything else about pricing works.

1. Supabase dashboard → **Project Settings → API Keys** → *Secret keys* → **Add new secret key**. Name it
   `github-keyshop-prices`. Copy the value; it starts with `sb_secret_`.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.
   Name: `SUPABASE_SECRET_KEY`. Value: paste the key. Paste it only there: not in chat, not in a file.
3. GitHub repo → **Actions → Key-shop prices → Run workflow** (leave the test box empty). The log should end
   with `Done — N price row(s) updated.` Key-shop prices then show on game pages after the next refresh.

If the key ever leaks, delete it in Supabase (step 1's page) and repeat steps 1–2 with a new one.

## Job secret (scheduled jobs) ✅
- `JOB_SECRET`: a random 64-character value. It's stored **both** as a Supabase secret and as a GitHub repo
  secret, with the same value. The `daily` workflow sends it so the `daily` function, and the functions it
  calls, know the request is the scheduled job.
- To rotate it, run in Terminal (it never shows the value):
  ```bash
  cd ~/Desktop/"On Deck" && K=$(openssl rand -hex 32) && npx supabase secrets set JOB_SECRET="$K" && printf '%s' "$K" | gh secret set JOB_SECRET; unset K
  ```

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
- Hardcover's terms: server-side use only (never in the browser) — On Deck only calls it from the `hardcover`
  Edge Function (book search + add). If the token lapses, book search shows an error (`hardcover_token_expired`).
- To replace it, run in Terminal (keeps it off screen and out of shell history):
  ```bash
  cd ~/Desktop/"On Deck" && read -rs "S?Hardcover token: " && echo && npx supabase secrets set HARDCOVER_TOKEN="$S"; unset S
  ```

## 7a. IsThereAnyDeal (official-store game prices) ✅
- [x] API key from a registered app (https://isthereanydeal.com/apps/my/) saved as `ITAD_API_KEY` (server).
  Only the API key is used; there's no OAuth and no user data.
- `GET /games/lookup/v1?appid=<steam appid>` → ITAD game id.
- `POST /games/prices/v3?country=<cc>&nondeals=true` with `[ids]` → per-store `price`, `regular`, `cut`,
  `drm` (key type), `storeLow` and `url`, plus `historyLow`.
- On Deck keeps **Steam, plus any store whose `drm` includes Steam** (Steam keys). Platform stores like
  Epic, Microsoft Store and GOG are dropped.
- To replace it: `npx supabase secrets set ITAD_API_KEY=…`.

## 7. gg.deals (third-party game prices) ✅
- [x] API key saved as `GGDEALS_API_KEY` (server).
- Lookup by Steam app id, per region:
  `https://api.gg.deals/v1/prices/by-steam-app-id/?ids=<appids>&key=…&region=<cc>`. It returns the current and
  historical-low prices for official stores (`currentRetail`, `historicalRetail`) and key shops
  (`currentKeyshops`, `historicalKeyshops`) in the region's currency, plus the gg.deals page URL.
- Takes up to 100 app ids per call.
- **gg.deals times out from Supabase's servers**, so key-shop prices are fetched by a GitHub Actions job
  (`scripts/keyshop-prices.mjs`, run every 6 h by `.github/workflows/keyshop-prices.yml`). It updates
  the key-shop columns of existing `game_prices` rows. The `prices` Edge Function still tries gg.deals, but
  keeps the stored values when there's no answer. To test the lookup alone, run the workflow by hand and put app ids in the
  test box (nothing is saved).
- The key is stored twice: Supabase (`npx supabase secrets set GGDEALS_API_KEY=…`) and GitHub repo secret
  `GGDEALS_API_KEY` (`gh secret set GGDEALS_API_KEY`). Replace both if it changes.

## 8. Steam ✅
- [x] Steam Web API key saved as `STEAM_API_KEY` (server).
- **Used only to check whether a game you add is already owned.** There's no library import.
  - Each user enters their Steam profile in Settings: a SteamID64, a profile URL, or a custom URL, which is
    resolved via `ISteamUser/ResolveVanityURL`.
  - When a game with a Steam app id is added or opened, `IPlayerService/GetOwnedGames` is called with
    `appids_filter` for just that game, and the game is marked **Owned** if it's in your library.
- Requires the Steam profile's **Game details** privacy set to Public
  (Steam → Profile → Edit Profile → Privacy Settings).
- Store prices, review % and Early Access status still come from public, keyless Steam endpoints.
- To replace it: https://steamcommunity.com/dev/apikey, then `npx supabase secrets set STEAM_API_KEY=…`.

## Not needed up front
- **Plex / Seerr** — each user links these themselves in On Deck's Settings page.
- **Custom SMTP** — optional. Lifts Supabase's few-emails-per-hour limit on sign-up
  and reset emails (e.g. Brevo free tier or a Gmail app password).
