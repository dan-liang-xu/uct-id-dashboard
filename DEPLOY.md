# Deploying the UCT Innovation District Data Atlas (public, GitHub Pages)

This is a fully static site. It is published to **GitHub Pages** from a **personal
(non-NFI) GitHub repo** via a GitHub Actions workflow. Every push to `main` rebuilds
and redeploys automatically.

Live URL after the first deploy: **https://dan-liang-xu.github.io/<repo-name>/**

## How it works

- `.github/workflows/deploy.yml` runs on push to `main`: `npm ci` → `npm run build` → upload `dist/` → deploy to Pages.
- The workflow sets `VITE_BASE=/<repo-name>/` automatically, so all asset / data / PMTiles URLs resolve under the project subpath. No manual base-path edits needed.
- All map data (GeoJSON + PMTiles, incl. the 88 MB buildings + 44 MB contours tiles) is committed under `public/data/layers/` and served straight from Pages (under GitHub's 100 MB/file limit; range requests supported, so PMTiles works).
- Raw source data (`data_sources/`) and `.env.local` are gitignored — they never ship.

## One-time setup

1. **Create the repo and push** (from `apps/id-dashboard/`):
   ```sh
   gh repo create <repo-name> --public --source=. --remote=origin --push
   ```
   (Or create an empty public repo on github.com and `git push -u origin main`.)

2. **Enable Pages → GitHub Actions**: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. (The first push may run the workflow before this is set — just re-run it from the Actions tab afterwards, or push again.)

3. Wait for the **Actions** run to finish (green). The site is live at the URL above.

## Street View (optional) — Google Maps key

Street View works only if a Google Maps JavaScript API key is provided at build time.
Without it, the Street View pane shows a friendly "add a key" message and the rest of
the atlas works normally.

**Because this site is public, the key is embedded in the published JavaScript.** Protect
it or it becomes an open door on your Google billing:

1. In **Google Cloud Console → Credentials**, ideally create a **separate key** for this
   site (don't reuse the CityPulse key, so restricting one can't break the other).
2. **Restrict it** → *Application restrictions* → **HTTP referrers** → add
   `https://dan-liang-xu.github.io/*` (and `http://localhost:*` for local dev).
   *API restrictions* → **Maps JavaScript API** only.
3. Add it to the repo: **Settings → Secrets and variables → Actions → New repository secret**
   → name `VITE_GOOGLE_MAPS_API_KEY`, value = the key. Re-run the workflow.

## Redeploying / updating data

- Edit code or drop new data (re-run `scripts/build_layers.py` to regenerate `public/data/layers/`), then `git commit` + `git push`. Actions redeploys within a couple of minutes.

## Notes

- Repo can be renamed freely — the workflow re-derives the base path from the new name on the next run.
- For a **custom domain** or a `dan-liang-xu.github.io` user page, the base must be `/`: unset `VITE_BASE` in the workflow (or set it to `/`).
- Basemap tiles (OpenFreeMap) and satellite imagery (Esri World Imagery) are external services with attribution shown; no keys required.
