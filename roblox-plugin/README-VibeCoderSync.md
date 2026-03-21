# VibeCoder Studio Sync plugin

Connects **Roblox Studio** to your **VibeCoder API** so generated Lua syncs into the place file when you build on the web app.

## How it works

1. The web app (`/app`) stores a **sync key** in the browser and **pushes** each successful generate/refine to `POST /sync/push` with `combined_lua`.
2. This plugin **polls** `GET /sync/latest?sync_key=...` and, when the **version** changes, applies `combined_lua` using `-- Script: Service/Path` headers (same idea as the JSON installer).

Data is held **in memory** on the API process today — fine for local dev; for production use a shared store and HTTPS.

## Install in Roblox Studio

1. Download **`VibeCoderSync.lua`** from your running site:  
   `http://localhost:3000/roblox-plugin/VibeCoderSync.lua` (or your deployed URL).
2. In Studio: **Plugins → Create Plugin** (or open an existing plugin place).
3. Add a **Script** under the plugin, paste the full contents of `VibeCoderSync.lua`, save.
4. **Studio Settings → Network**: allow **HTTP requests**; if Studio asks, allow your API host (e.g. `127.0.0.1` for local dev).

## Configure

1. Open the web builder → **Roblox Studio live sync** → **Copy** the sync key for the **current project** (each project has its own key; switch project in the sidebar to see/copy the other key).

2. In the plugin widget:
   - **API base URL**: `http://127.0.0.1:8000` (must match `NEXT_PUBLIC_API_BASE` / your backend; no trailing slash).
   - **Sync key**: paste the same key as on the web.
3. Click **Save settings**, then **Start polling** (or use **Fetch & apply now** once).

Generate or refine on the web; within a poll interval, Studio updates or creates scripts under the paths in your Lua headers.

## Security note

Anyone who knows the **sync key** can poll or overwrite that channel. Treat the key like a password. Later you can require `Authorization` on `/sync/push` and `/sync/latest` per user.

## Studio + assistant (next phase)

This plugin handles **Lua sync**. A separate “assistant” flow inside Studio can build on the same API (`/plugin-health`, streaming endpoints) later.
