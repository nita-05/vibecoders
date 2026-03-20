# AI Game Builder (Roblox Studio plugin)

## “Failed to load plugin” fixes

1. **Use a valid `.rbxmx`**  
   Build from source (same format as `VibeCoderInstaller.rbxmx`):
   ```powershell
   cd roblox-plugin
   python build_rbxmx.py
   ```
   Then copy `AIGameBuilder.rbxmx` to:
   `%LOCALAPPDATA%\Roblox\Plugins\`

2. **Avoid spaces in the filename**  
   Prefer `AIGameBuilder.rbxmx` instead of `AI Game Builder.rbxmx` (some setups are picky).

3. **Do not set `RunContext` to `0` (Legacy)** in the XML for a plugin loaded from the Plugins folder. The generated `AIGameBuilder.rbxmx` **omits** `RunContext` on purpose (matches the working installer).

4. **Do not paste raw Lua into an `.rbxmx` by hand** unless the whole file is valid XML. Unescaped `<` / `&` in `Source` will corrupt the file. Use `build_rbxmx.py` or Studio’s own plugin export.

5. **Restart Studio** after copying the file.

## Install (PowerShell)

From repo `roblox-plugin` folder:

```powershell
.\install-plugin.ps1
```

## Backend

Plugin expects `http://localhost:8000/start` and `/stream` (see `backend/plugin_stream.py`).
