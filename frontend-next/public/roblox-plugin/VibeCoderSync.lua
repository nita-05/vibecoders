-- VibeCoder Studio Sync — polls your VibeCoder API for the latest generated Lua and applies it in Studio.
-- Setup:
-- 1) On the web builder, sign in; open "Roblox Studio live sync", copy Sync key and "Copy" access token; note API URL.
-- 2) In Studio: File → Studio Settings → Network → enable HTTP requests; add your API host if prompted.
-- 3) Paste API URL, Sync key, and access token below (Save), click "Start polling".
-- 4) Generate or refine code on the platform — scripts update here when the version changes.

local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

-- StudioService has no RecordUndo; use ChangeHistoryService for undoable plugin edits.
local function runWithUndoRecording(label: string, fn: () -> ())
	local recordingId = ChangeHistoryService:TryBeginRecording(label)
	if recordingId then
		local ok, err = pcall(fn)
		if ok then
			pcall(function()
				ChangeHistoryService:FinishRecording(recordingId, Enum.FinishRecordingOperation.Commit)
			end)
		else
			pcall(function()
				ChangeHistoryService:FinishRecording(recordingId, Enum.FinishRecordingOperation.Cancel)
			end)
			error(err)
		end
	else
		fn()
	end
end

local PLUGIN_TITLE = "VibeCoder Sync"
local SETTINGS_API = "VibeCoderSyncApiBase"
local SETTINGS_KEY = "VibeCoderSyncKey"
local SETTINGS_TOKEN = "VibeCoderSyncBearer"
local SETTINGS_POLL = "VibeCoderSyncPollSec"

-- Production backend (no trailing slash). Edit if you self-host.
local DEFAULT_API_BASE = "https://vibecoder-api.onrender.com"
local LEGACY_LOCAL_API = {
	["http://127.0.0.1:8000"] = true,
	["http://localhost:8000"] = true,
}

local toolbar = plugin:CreateToolbar("VibeCoder")
local toggleBtn = toolbar:CreateButton("Sync", "Open VibeCoder Studio Sync", "rbxassetid://4458901886")
toggleBtn.ClickableWhenViewportHidden = true

-- Wider / taller default so the dock isn’t clipped; content scrolls inside.
local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right,
	false,
	false,
	400,
	620,
	440,
	720
)

local widget = plugin:CreateDockWidgetPluginGui("VibeCoderSyncWidget", widgetInfo)
widget.Title = PLUGIN_TITLE

local root = Instance.new("Frame")
root.BackgroundColor3 = Color3.fromRGB(20, 23, 33)
root.BorderSizePixel = 0
root.Size = UDim2.fromScale(1, 1)
root.Parent = widget

local scroll = Instance.new("ScrollingFrame")
scroll.Name = "Scroll"
scroll.BorderSizePixel = 0
scroll.BackgroundColor3 = Color3.fromRGB(20, 23, 33)
scroll.Size = UDim2.new(1, 0, 1, 0)
scroll.Position = UDim2.fromScale(0, 0)
scroll.ScrollBarThickness = 10
scroll.ScrollBarImageColor3 = Color3.fromRGB(71, 85, 105)
scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.ScrollingDirection = Enum.ScrollingDirection.Y
scroll.Parent = root

local content = Instance.new("Frame")
content.Name = "Content"
content.BackgroundTransparency = 1
content.Size = UDim2.new(1, -16, 0, 0)
content.Position = UDim2.new(0, 8, 0, 8)
content.AutomaticSize = Enum.AutomaticSize.Y
content.Parent = scroll

local pad = Instance.new("UIPadding")
pad.PaddingTop = UDim.new(0, 4)
pad.PaddingBottom = UDim.new(0, 20)
pad.PaddingLeft = UDim.new(0, 4)
pad.PaddingRight = UDim.new(0, 4)
pad.Parent = content

local list = Instance.new("UIListLayout")
list.Padding = UDim.new(0, 10)
list.SortOrder = Enum.SortOrder.LayoutOrder
list.Parent = content

local function addTitleRow(text: string)
	local lbl = Instance.new("TextLabel")
	lbl.BackgroundTransparency = 1
	lbl.Size = UDim2.new(1, 0, 0, 0)
	lbl.AutomaticSize = Enum.AutomaticSize.Y
	lbl.Font = Enum.Font.GothamBold
	lbl.TextSize = 15
	lbl.TextColor3 = Color3.fromRGB(241, 245, 249)
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.TextWrapped = true
	lbl.Text = text
	lbl.Parent = content
	return lbl
end

local function addHelp(text: string)
	local lbl = Instance.new("TextLabel")
	lbl.BackgroundTransparency = 1
	lbl.Size = UDim2.new(1, 0, 0, 0)
	lbl.AutomaticSize = Enum.AutomaticSize.Y
	lbl.Font = Enum.Font.Gotham
	lbl.TextSize = 11
	lbl.TextColor3 = Color3.fromRGB(148, 163, 184)
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.TextWrapped = true
	lbl.Text = text
	lbl.Parent = content
	return lbl
end

local function addFieldLabel(text: string)
	local lbl = Instance.new("TextLabel")
	lbl.BackgroundTransparency = 1
	lbl.Size = UDim2.new(1, 0, 0, 18)
	lbl.Font = Enum.Font.GothamBold
	lbl.TextSize = 12
	lbl.TextColor3 = Color3.fromRGB(203, 213, 225)
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.Text = text
	lbl.Parent = content
	return lbl
end

local function styleBox(box: TextBox)
	box.Font = Enum.Font.Code
	box.TextSize = 12
	box.TextColor3 = Color3.fromRGB(229, 231, 235)
	box.BackgroundColor3 = Color3.fromRGB(15, 23, 42)
	box.BorderSizePixel = 0
	-- No UICorner: Studio’s StyleRule / .RoundedCorner8 can conflict with plugin UIs and throw
	-- "Unable to cast string to UDim" in the output window.
end

local lo = 0
local function nextLayoutOrder()
	lo = lo + 1
	return lo
end

local titleLbl = addTitleRow("VibeCoder Studio Sync")
titleLbl.LayoutOrder = nextLayoutOrder()
local helpLbl = addHelp("Scroll for all fields. Status updates when you Save, Fetch, or Poll. Access token must match your signed-in web account.")
helpLbl.LayoutOrder = nextLayoutOrder()

local status = Instance.new("TextLabel")
status.Name = "StatusLine"
status.BackgroundColor3 = Color3.fromRGB(15, 23, 42)
status.BackgroundTransparency = 0.2
status.Size = UDim2.new(1, 0, 0, 0)
status.AutomaticSize = Enum.AutomaticSize.Y
status.Font = Enum.Font.Gotham
status.TextSize = 11
status.TextColor3 = Color3.fromRGB(186, 230, 253)
status.TextXAlignment = Enum.TextXAlignment.Left
status.TextYAlignment = Enum.TextYAlignment.Top
status.TextWrapped = true
status.Text = "Status: Ready — click Save settings to confirm storage; message appears here."
status.Parent = content
local statusPad = Instance.new("UIPadding")
statusPad.PaddingTop = UDim.new(0, 10)
statusPad.PaddingBottom = UDim.new(0, 10)
statusPad.PaddingLeft = UDim.new(0, 10)
statusPad.PaddingRight = UDim.new(0, 10)
statusPad.Parent = status
status.LayoutOrder = nextLayoutOrder()

local lblApi = addFieldLabel("API base URL (no trailing slash)")
lblApi.LayoutOrder = nextLayoutOrder()
local apiBox = Instance.new("TextBox")
apiBox.ClearTextOnFocus = false
apiBox.Text = DEFAULT_API_BASE
apiBox.PlaceholderText = DEFAULT_API_BASE
apiBox.Size = UDim2.new(1, 0, 0, 34)
styleBox(apiBox)
apiBox.Parent = content
apiBox.LayoutOrder = nextLayoutOrder()

local lblKey = addFieldLabel("Sync key (from web app → Roblox Studio live sync)")
lblKey.LayoutOrder = nextLayoutOrder()
local keyBox = Instance.new("TextBox")
keyBox.ClearTextOnFocus = false
keyBox.Text = ""
keyBox.PlaceholderText = "paste sync key"
keyBox.Size = UDim2.new(1, 0, 0, 34)
styleBox(keyBox)
keyBox.Parent = content
keyBox.LayoutOrder = nextLayoutOrder()

local lblToken = addFieldLabel("Access token (web app → Roblox Studio live sync → Copy)")
lblToken.LayoutOrder = nextLayoutOrder()
local tokenBox = Instance.new("TextBox")
tokenBox.ClearTextOnFocus = false
tokenBox.Text = ""
tokenBox.PlaceholderText = "paste JWT (same account as web)"
tokenBox.Size = UDim2.new(1, 0, 0, 34)
styleBox(tokenBox)
tokenBox.Parent = content
tokenBox.LayoutOrder = nextLayoutOrder()

local lblPoll = addFieldLabel("Poll interval (seconds, min 2)")
lblPoll.LayoutOrder = nextLayoutOrder()
local pollBox = Instance.new("TextBox")
pollBox.ClearTextOnFocus = false
pollBox.Text = "4"
pollBox.Size = UDim2.new(1, 0, 0, 30)
styleBox(pollBox)
pollBox.Parent = content
pollBox.LayoutOrder = nextLayoutOrder()

local saveBtn = Instance.new("TextButton")
saveBtn.Size = UDim2.new(1, 0, 0, 38)
saveBtn.Font = Enum.Font.GothamBold
saveBtn.TextSize = 14
saveBtn.TextColor3 = Color3.fromRGB(34, 211, 238)
saveBtn.BackgroundColor3 = Color3.fromRGB(24, 48, 62)
saveBtn.BorderSizePixel = 0
saveBtn.Text = "Save settings"
saveBtn.AutoButtonColor = true
saveBtn.Parent = content
saveBtn.LayoutOrder = nextLayoutOrder()

local pollRow = Instance.new("Frame")
pollRow.BackgroundTransparency = 1
pollRow.Size = UDim2.new(1, 0, 0, 40)
pollRow.Parent = content
pollRow.LayoutOrder = nextLayoutOrder()

local startBtn = Instance.new("TextButton")
startBtn.Size = UDim2.new(0.5, -5, 1, 0)
startBtn.Position = UDim2.new(0, 0, 0, 0)
startBtn.Font = Enum.Font.GothamBold
startBtn.TextSize = 13
startBtn.TextColor3 = Color3.fromRGB(34, 211, 238)
startBtn.BackgroundColor3 = Color3.fromRGB(22, 101, 52)
startBtn.BorderSizePixel = 0
startBtn.Text = "Start polling"
startBtn.Parent = pollRow

local stopBtn = Instance.new("TextButton")
stopBtn.Size = UDim2.new(0.5, -5, 1, 0)
stopBtn.Position = UDim2.new(0.5, 5, 0, 0)
stopBtn.Font = Enum.Font.GothamBold
stopBtn.TextSize = 13
stopBtn.TextColor3 = Color3.fromRGB(248, 250, 252)
stopBtn.BackgroundColor3 = Color3.fromRGB(127, 29, 29)
stopBtn.BorderSizePixel = 0
stopBtn.Text = "Stop"
stopBtn.Parent = pollRow

local applyBtn = Instance.new("TextButton")
applyBtn.Size = UDim2.new(1, 0, 0, 38)
applyBtn.Font = Enum.Font.GothamBold
applyBtn.TextSize = 13
applyBtn.TextColor3 = Color3.fromRGB(226, 232, 240)
applyBtn.BackgroundColor3 = Color3.fromRGB(51, 65, 85)
applyBtn.BorderSizePixel = 0
applyBtn.Text = "Fetch & apply now"
applyBtn.Parent = content
applyBtn.LayoutOrder = nextLayoutOrder()

local syncing = false
local lastVersion = ""
local lastCombined = ""

local function getServiceRoot(serviceName: string)
	if serviceName == "Workspace" then
		return workspace
	end
	local lowered = string.lower(serviceName)
	if lowered == "starterplayerscripts" or lowered == "startercharacterscripts" then
		local okSp, sp = pcall(function()
			return game:GetService("StarterPlayer")
		end)
		if okSp and sp then
			local folderName = lowered == "starterplayerscripts" and "StarterPlayerScripts" or "StarterCharacterScripts"
			local folder = sp:FindFirstChild(folderName)
			if folder then
				return folder
			end
		end
		return nil
	end
	local ok, svc = pcall(function()
		return game:GetService(serviceName)
	end)
	if ok and svc then
		return svc
	end
	return nil
end

local function ensureFolder(parent: Instance, name: string)
	local existing = parent:FindFirstChild(name)
	if existing and existing:IsA("Folder") then
		return existing
	end
	local folder = Instance.new("Folder")
	folder.Name = name
	folder.Parent = parent
	return folder
end

local function splitPath(path: string)
	local parts = {}
	for part in string.gmatch(path, "[^/]+") do
		table.insert(parts, part)
	end
	return parts
end

local function scriptClassForPath(pathLower: string): string
	if string.find(pathLower, "starterplayerscripts", 1, true)
		or string.find(pathLower, "startercharacterscripts", 1, true)
	then
		return "LocalScript"
	end
	return "Script"
end

local function installOrUpdateAtPath(path: string, source: string): (boolean, string)
	path = string.gsub(path, "^%s+", "")
	path = string.gsub(path, "%s+$", "")
	source = string.gsub(source, "^%s*\n", "")
	source = string.gsub(source, "%s+$", "")
	if path == "" or source == "" then
		return false, "empty"
	end

	local parts = splitPath(path)
	if #parts < 2 then
		return false, "bad path"
	end

	local rootName = parts[1]
	local rootInst = getServiceRoot(rootName)
	if not rootInst then
		return false, "unknown root: " .. rootName
	end

	local parent = rootInst
	for i = 2, #parts - 1 do
		parent = ensureFolder(parent, parts[i])
	end

	local scriptName = parts[#parts]
	local className = scriptClassForPath(string.lower(path))
	local existing = parent:FindFirstChild(scriptName)

	if existing and (existing:IsA("Script") or existing:IsA("LocalScript") or existing:IsA("ModuleScript")) then
		if existing.ClassName ~= className then
			local replacement = Instance.new(className)
			replacement.Name = scriptName
			replacement.Source = source
			replacement.Parent = parent
			existing:Destroy()
		else
			existing.Source = source
		end
		return true, path .. " (updated)"
	end

	local scriptObj = Instance.new(className)
	scriptObj.Name = scriptName
	scriptObj.Source = source
	scriptObj.Parent = parent
	return true, path .. " (created)"
end

local function parseLuaSections(text: string): { { path: string, code: string } }
	local sections: { { path: string, code: string } } = {}
	text = string.gsub(text or "", "\r\n", "\n")
	local lines = {}
	for line in string.gmatch(text .. "\n", "(.-)\n") do
		table.insert(lines, line)
	end

	local headerRe = "^%s*%-%-%s*[Ss]cript:%s*(.+)%s*$"
	local currentPath: string? = nil
	local buf: { string } = {}

	local function flush()
		if currentPath then
			local p = string.gsub(currentPath, "^%s+", "")
			p = string.gsub(p, "%s+$", "")
			local code = table.concat(buf, "\n")
			code = string.gsub(code, "^%s*\n", "")
			code = string.gsub(code, "%s+$", "")
			if p ~= "" and code ~= "" then
				table.insert(sections, { path = p, code = code })
			end
		end
		buf = {}
	end

	for _, line in ipairs(lines) do
		local path = string.match(line, headerRe)
		if path then
			flush()
			currentPath = path
		else
			if currentPath then
				table.insert(buf, line)
			end
		end
	end
	flush()

	if #sections == 0 and string.len(string.gsub(text, "%s", "")) > 0 then
		table.insert(sections, { path = "ServerScriptService/VibeCoderSynced", code = text })
	end

	return sections
end

local function applyCombinedLua(combinedLua: string): (number, { string })
	local sections = parseLuaSections(combinedLua)
	local okCount = 0
	local msgs: { string } = {}
	for _, sec in ipairs(sections) do
		local ok, msg = installOrUpdateAtPath(sec.path, sec.code)
		if ok then
			okCount = okCount + 1
			table.insert(msgs, msg)
		else
			table.insert(msgs, tostring(sec.path) .. ": " .. tostring(msg))
		end
	end
	return okCount, msgs
end

local function setStatus(msg: string)
	status.Text = msg
end

local function fetchLatest(): (boolean, any?, string?)
	local base = string.gsub(apiBox.Text or "", "^%s+", "")
	base = string.gsub(base, "%s+$", "")
	base = string.gsub(base, "/+$", "")
	local key = string.gsub(keyBox.Text or "", "^%s+", "")
	key = string.gsub(key, "%s+$", "")
	local rawToken = tokenBox.Text or ""
	local token = string.gsub(string.gsub(rawToken, "^%s+", ""), "%s+$", "")
	if base == "" or key == "" then
		return false, nil, "Set API URL and Sync key first."
	end
	if token == "" then
		return false, nil, "Paste Access token (Copy from web app → Roblox Studio live sync)."
	end

	local url = base .. "/sync/latest?sync_key=" .. HttpService:UrlEncode(key)
	local urlStr = tostring(url)
	local reqOk, result = pcall(function()
		return HttpService:RequestAsync({
			Url = urlStr,
			Method = "GET",
			Headers = {
				Authorization = "Bearer " .. token,
			},
		})
	end)
	if not reqOk then
		return false, nil, "Request failed: " .. tostring(result) .. " URL: " .. urlStr
	end
	if not result.Success then
		local code = result.StatusCode or 0
		local body = tostring(result.Body or "")
		if code == 401 or code == 403 then
			return false, nil, "Auth failed (" .. tostring(code) .. "). Copy the access token again from the web (signed in). " .. body
		end
		if string.find(tostring(code), "404") or string.find(body, "404") or string.find(body, "Not Found") then
			return false, nil, "No sync data yet for this key. Generate on the web with Studio sync ON; Sync key must match the project. URL: " .. urlStr
		end
		return false, nil, "HTTP " .. tostring(code) .. ": " .. body
	end

	local body = result.Body
	local decoded: any
	local decOk, decErr = pcall(function()
		decoded = HttpService:JSONDecode(body)
	end)
	if not decOk or type(decoded) ~= "table" then
		return false, nil, "Bad JSON: " .. tostring(decErr)
	end

	return true, decoded, nil
end

local function applyPayload(decoded)
	local ver = tostring(decoded.version or "")
	local lua = decoded.combined_lua
	if ver == "0" and (type(lua) ~= "string" or lua == "") then
		return "Waiting for first push on this key/project. Generate or refine once in the web app."
	end
	if type(lua) ~= "string" or lua == "" then
		return "No combined_lua in response."
	end

	if ver ~= "" and ver == lastVersion and lua == lastCombined then
		return "Already up to date (" .. ver .. ")."
	end

	local created = 0
	local notes: { string } = {}
	local okApply, applyErr = pcall(function()
		runWithUndoRecording("VibeCoder Sync apply", function()
			local n, msgs = applyCombinedLua(lua)
			created = n
			notes = msgs
		end)
	end)
	if not okApply then
		return "Apply failed: " .. tostring(applyErr)
	end

	lastVersion = ver
	lastCombined = lua

	return string.format("Applied version %s — %d script(s). %s", ver ~= "" and ver or "?", created, table.concat(notes, "; "))
end

local function pollOnce()
	local ok, decoded, err = fetchLatest()
	if not ok then
		setStatus("Poll: " .. tostring(err))
		return
	end
	local msg = applyPayload(decoded)
	setStatus("Poll: " .. msg)
end

local function startPolling()
	if syncing then
		return
	end
	syncing = true
	setStatus("Polling…")
	task.spawn(function()
		while syncing do
			pcall(pollOnce)
			if not syncing then
				break
			end
			local sec = tonumber(pollBox.Text) or 4
			if sec < 2 then
				sec = 2
			end
			task.wait(sec)
		end
	end)
	setStatus("Polling started. Generate on the web to push updates.")
end

local function stopPolling()
	syncing = false
	setStatus("Polling stopped.")
end

saveBtn.MouseButton1Click:Connect(function()
	local ok, err = pcall(function()
		plugin:SetSetting(SETTINGS_API, apiBox.Text)
		plugin:SetSetting(SETTINGS_KEY, keyBox.Text)
		plugin:SetSetting(SETTINGS_TOKEN, tokenBox.Text)
		plugin:SetSetting(SETTINGS_POLL, pollBox.Text)
	end)
	if ok then
		setStatus("Saved — API, sync key, access token, and poll interval stored. Next: generate on the web (signed in), then Fetch & apply or Start polling.")
	else
		setStatus("Save failed: " .. tostring(err))
	end
end)

applyBtn.MouseButton1Click:Connect(function()
	plugin:Activate(true)
	local ok, decoded, err = fetchLatest()
	if not ok then
		setStatus("Apply: " .. tostring(err))
		return
	end
	local msg = applyPayload(decoded)
	setStatus("Apply: " .. msg)
end)

startBtn.MouseButton1Click:Connect(function()
	plugin:Activate(true)
	startPolling()
end)

stopBtn.MouseButton1Click:Connect(function()
	stopPolling()
end)

toggleBtn.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

-- Load saved settings; migrate old localhost saves to production API once.
pcall(function()
	local a = plugin:GetSetting(SETTINGS_API)
	local k = plugin:GetSetting(SETTINGS_KEY)
	local tok = plugin:GetSetting(SETTINGS_TOKEN)
	local p = plugin:GetSetting(SETTINGS_POLL)
	if type(a) == "string" and a ~= "" then
		local url = string.gsub(a, "/+$", "")
		if LEGACY_LOCAL_API[url] then
			url = DEFAULT_API_BASE
			plugin:SetSetting(SETTINGS_API, url)
		end
		apiBox.Text = url
	else
		apiBox.Text = DEFAULT_API_BASE
	end
	if type(k) == "string" then
		keyBox.Text = k
	end
	if type(tok) == "string" then
		tokenBox.Text = tok
	end
	if type(p) == "string" and p ~= "" then
		pollBox.Text = p
	end
end)
