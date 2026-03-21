# VibeCoder Studio Sync plugin

Connects **Roblox Studio** to your **VibeCoder API** so generated Lua syncs into the place file when you build on the web app.

## How it works

1. The web app (`/app`) stores a **sync key** in the browser and **pushes** each successful generate/refine to `POST /sync/push` with `combined_lua`, using **`Authorization: Bearer <JWT>`** (same token as sign-in).
2. This plugin **polls** `GET /sync/latest?sync_key=...` with the same Bearer token and, when the **version** changes, applies `combined_lua` using `-- Script: Service/Path` headers (same idea as the JSON installer).

Sync state is stored in **MongoDB** when `MONGODB_URI` is configured (with an in-memory fallback for local dev).

## Install in Roblox Studio

1. Download **`VibeCoderSync.lua`** from your running site:  
   `http://localhost:3000/roblox-plugin/VibeCoderSync.lua` (or your deployed URL).
2. In Studio: **Plugins → Create Plugin** (or open an existing plugin place).
3. Add a **Script** under the plugin, paste the full contents of `VibeCoderSync.lua`, save.
4. **Studio Settings → Network**: allow **HTTP requests**; if Studio asks, allow your API host (e.g. `127.0.0.1` for local dev).

## Configure

1. Open the web builder → **Roblox Studio live sync** → **Copy** the sync key for the **current project** (each project has its own key; switch project in the sidebar to see/copy the other key).

2. In the plugin widget:
   - **API base URL**: defaults to **`https://vibecoder-api.onrender.com`** (production). For local dev, use `http://127.0.0.1:8000` — must match your web app’s API (no trailing slash).
   - **Sync key**: paste the same key as on the web.
   - **Access token**: in the web app, **Copy** next to “Access token” (same JWT as sign-in; must match the account that pushes from the web).
3. Click **Save settings**, then **Start polling** (or use **Fetch & apply now** once).

Generate or refine on the web; within a poll interval, Studio updates or creates scripts under the paths in your Lua headers.

### Path format (important)

- Use **`-- Script: ServiceName/.../ScriptName`** headers in the generated Lua (one block per script).
- **`ServerScriptService`**, **`ReplicatedStorage`**, etc. are valid `GetService` roots.
- **`StarterPlayerScripts`** and **`StarterCharacterScripts`** are **not** services — they are folders under **`StarterPlayer`**. The plugin accepts the short form `StarterPlayerScripts/MyLocal` (same as `StarterPlayer/StarterPlayerScripts/MyLocal`).
- **`Workspace/...`** paths create **Scripts** under folders/parts names — for real `Part` instances, add parts manually or use a different workflow.

## Undo / change history

Applies use **`ChangeHistoryService:TryBeginRecording` / `FinishRecording`** so edits are undoable in Studio.  
(`StudioService:RecordUndo` is **not** a real API — older snippets that used it will error at runtime.)

## Security note

**Sync key** plus **Bearer JWT** must match the account that owns the channel: `POST /sync/push` and `GET /sync/latest` require authentication. Treat the token like a password in Studio (don’t share your plugin place publicly with it embedded).

## Studio + assistant (next phase)

This plugin handles **Lua sync**. A separate “assistant” flow inside Studio can build on the same API (`/plugin-health`, streaming endpoints) later.
