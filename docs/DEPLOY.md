# Deploying Terralog

Terralog is a static Vite build plus two small serverless functions (`api/parse.ts`, `api/explain.ts`). Vercel fits it with no extra code; `vercel.json` is already set up.

## Steps (Vercel, about 10 minutes)

1. Merge the working branch into `main` (or pick the branch in step 3).
2. On vercel.com: **Add New → Project → Import** `Tegh25/NASA-SpaceApps-2026`. Framework preset: Vite (auto-detected). Leave build command and output directory as they come from `vercel.json`.
3. **Environment variables** (Project → Settings → Environment Variables):

   | Name | Required | Notes |
   |---|---|---|
   | `CESIUM_ION_TOKEN` | Recommended | Public: it is bundled into the client. Create a **separate token for production** at ion.cesium.com/tokens and restrict it to your Vercel domain under "Allowed URLs", so nobody can reuse it. Without it the globe uses keyless NASA GIBS imagery and no 3D terrain. |
   | `BACKBOARD_API_KEY` | Optional | Server only. Enables the LLM text parser and "Ask AI". Without it both fall back to the keyword parser and the curated text. |
   | `LLM_NAME` | Optional | Model name for the Backboard calls. |

   `CESIUM_ION_TOKEN` is read at **build** time, so redeploy after changing it.
4. Deploy. Every push to `main` redeploys; every PR gets a preview URL.

## What is cached (and why load is fast on repeat visits)

`vercel.json` sets:

| Path | Cache | Why |
|---|---|---|
| `/assets/*` | 1 year, immutable | Hashed JS/CSS file names change on each build |
| `/cesium/*` | 30 days | Cesium workers and assets, versioned by the npm package |
| `/img/*`, `/textures/*` | 7 days | Hero images and planet textures |
| `/data/*` | 1 hour, then stale-while-revalidate for 7 days | Research outputs; a rebuild of the data shows up within an hour |

Vercel's CDN also compresses JSON and JS with Brotli, so `earth_cells.json` (1.3 MB raw) goes over the wire much smaller.

## Rate limits to know about

- **NASA GIBS and Cesium ion tiles** can throttle (HTTP 429) when one IP reloads a lot. The globe now has a local base layer (Cesium's bundled Natural Earth II) and hides a remote layer after repeated tile errors, so it never goes blank.
- **Cesium ion free tier** has monthly limits on tiles and Google Photorealistic 3D Tiles sessions. Check usage at ion.cesium.com before a demo day.
- **`/api/explain`** allows 10 LLM calls per minute per IP, **`/api/parse`** 20. The counters live in function memory, so they reset on cold starts; they exist to stop accidental loops, not abuse. Without `BACKBOARD_API_KEY` no limit applies (curated text is free).

## Before the demo

- Open the production URL once on the demo laptop and walk the demo path in `AGENT_HANDOFF.md` section 12, so tiles and the 4 MB Cesium chunk are in the browser cache.
- Keep a second tab open on the same URL as a fallback.

## Alternatives

- **Netlify** works the same way (static build + functions), but the two functions would need a small Netlify adapter.
- **GitHub Pages / any static host** works if you drop the AI features: the app falls back to the keyword parser and curated text when `/api/*` is missing. Add an SPA fallback (`404.html` copy of `index.html`) for deep links like `/site/...`.
