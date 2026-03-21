--!strict
-- AI Game Builder Plugin (local plugin: copy to %LOCALAPPDATA%\Roblox\Plugins\ as .rbxmx)
-- Security: Home -> Game Settings -> Security -> Enable Studio Access to API Services
-- Backend: python -m uvicorn backend.main:app --reload --port 8000

local HttpService = game:GetService("HttpService")
local StudioService = game:GetService("StudioService")
local Selection = game:GetService("Selection")

local BASE_URL = "http://localhost:8000"
local BUILD_START_ENDPOINT = "/build/start"
local BUILD_STREAM_ENDPOINT = "/build/stream"
local SYNC_LATEST_ENDPOINT = "/sync/latest"

local POLL_INTERVAL = 0.5
local SYNC_POLL_INTERVAL = 1.5
local MAX_IDLE_CYCLES = 30

local toolbar = plugin:CreateToolbar("AI Tools")
local toggleButton = toolbar:CreateButton(
	"AI Game Builder",
	"Open AI Game Builder panel",
	"rbxassetid://4458901886"
)
toggleButton.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right,
	true,
	false,
	480,
	560,
	320,
	300
)

local widget = plugin:CreateDockWidgetPluginGui("AIGameBuilderWidget", widgetInfo)
widget.Title = "AI Game Builder"

toggleButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

local root = Instance.new("Frame")
root.Name = "Root"
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(28, 30, 36)
root.BorderSizePixel = 0
root.Parent = widget

local pad = Instance.new("UIPadding")
pad.PaddingTop = UDim.new(0, 10)
pad.PaddingBottom = UDim.new(0, 10)
pad.PaddingLeft = UDim.new(0, 10)
pad.PaddingRight = UDim.new(0, 10)
pad.Parent = root

local layout = Instance.new("UIListLayout")
layout.FillDirection = Enum.FillDirection.Vertical
layout.Padding = UDim.new(0, 8)
layout.Parent = root

local promptLabel = Instance.new("TextLabel")
promptLabel.Size = UDim2.new(1, 0, 0, 20)
promptLabel.BackgroundTransparency = 1
promptLabel.Text = "Game Idea / Prompt"
promptLabel.TextXAlignment = Enum.TextXAlignment.Left
promptLabel.TextColor3 = Color3.fromRGB(230, 230, 230)
promptLabel.Font = Enum.Font.SourceSansSemibold
promptLabel.TextSize = 16
promptLabel.Parent = root

local promptBox = Instance.new("TextBox")
promptBox.Size = UDim2.new(1, 0, 0, 90)
promptBox.BackgroundColor3 = Color3.fromRGB(42, 45, 55)
promptBox.BorderSizePixel = 0
promptBox.ClearTextOnFocus = false
promptBox.MultiLine = true
promptBox.TextWrapped = true
promptBox.TextXAlignment = Enum.TextXAlignment.Left
promptBox.TextYAlignment = Enum.TextYAlignment.Top
promptBox.TextColor3 = Color3.fromRGB(240, 240, 240)
promptBox.PlaceholderText = "Describe the game you want to build..."
promptBox.PlaceholderColor3 = Color3.fromRGB(150, 150, 150)
promptBox.Font = Enum.Font.Code
promptBox.TextSize = 15
promptBox.Text = ""
promptBox.Parent = root

local promptPad = Instance.new("UIPadding")
promptPad.PaddingTop = UDim.new(0, 6)
promptPad.PaddingBottom = UDim.new(0, 6)
promptPad.PaddingLeft = UDim.new(0, 8)
promptPad.PaddingRight = UDim.new(0, 8)
promptPad.Parent = promptBox

local syncKeyLabel = Instance.new("TextLabel")
syncKeyLabel.Size = UDim2.new(1, 0, 0, 20)
syncKeyLabel.BackgroundTransparency = 1
syncKeyLabel.Text = "Sync Key (match platform)"
syncKeyLabel.TextXAlignment = Enum.TextXAlignment.Left
syncKeyLabel.TextColor3 = Color3.fromRGB(230, 230, 230)
syncKeyLabel.Font = Enum.Font.SourceSansSemibold
syncKeyLabel.TextSize = 14
syncKeyLabel.Parent = root

local syncKeyBox = Instance.new("TextBox")
syncKeyBox.Size = UDim2.new(1, 0, 0, 34)
syncKeyBox.BackgroundColor3 = Color3.fromRGB(42, 45, 55)
syncKeyBox.BorderSizePixel = 0
syncKeyBox.ClearTextOnFocus = false
syncKeyBox.TextXAlignment = Enum.TextXAlignment.Left
syncKeyBox.TextColor3 = Color3.fromRGB(240, 240, 240)
syncKeyBox.PlaceholderText = "default"
syncKeyBox.PlaceholderColor3 = Color3.fromRGB(150, 150, 150)
syncKeyBox.Font = Enum.Font.Code
syncKeyBox.TextSize = 14
syncKeyBox.Text = "default"
syncKeyBox.Parent = root

local syncTokenLabel = Instance.new("TextLabel")
syncTokenLabel.Size = UDim2.new(1, 0, 0, 20)
syncTokenLabel.BackgroundTransparency = 1
syncTokenLabel.Text = "Sync access token (JWT — same as web sign-in)"
syncTokenLabel.TextXAlignment = Enum.TextXAlignment.Left
syncTokenLabel.TextColor3 = Color3.fromRGB(230, 230, 230)
syncTokenLabel.Font = Enum.Font.SourceSansSemibold
syncTokenLabel.TextSize = 14
syncTokenLabel.Parent = root

local syncTokenBox = Instance.new("TextBox")
syncTokenBox.Size = UDim2.new(1, 0, 0, 34)
syncTokenBox.BackgroundColor3 = Color3.fromRGB(42, 45, 55)
syncTokenBox.BorderSizePixel = 0
syncTokenBox.ClearTextOnFocus = false
syncTokenBox.TextXAlignment = Enum.TextXAlignment.Left
syncTokenBox.TextColor3 = Color3.fromRGB(240, 240, 240)
syncTokenBox.PlaceholderText = "paste from web app Studio sync"
syncTokenBox.PlaceholderColor3 = Color3.fromRGB(150, 150, 150)
syncTokenBox.Font = Enum.Font.Code
syncTokenBox.TextSize = 14
syncTokenBox.Text = ""
syncTokenBox.Parent = root

local generateButton = Instance.new("TextButton")
generateButton.Size = UDim2.new(1, 0, 0, 34)
generateButton.BackgroundColor3 = Color3.fromRGB(66, 133, 244)
generateButton.BorderSizePixel = 0
generateButton.Text = "Build with AI"
generateButton.TextColor3 = Color3.fromRGB(255, 255, 255)
generateButton.Font = Enum.Font.SourceSansBold
generateButton.TextSize = 16
generateButton.AutoButtonColor = true
generateButton.Parent = root
generateButton.ZIndex = 5

local buildButton = Instance.new("TextButton")
buildButton.Size = UDim2.new(1, 0, 0, 34)
buildButton.BackgroundColor3 = Color3.fromRGB(34, 197, 94)
buildButton.BorderSizePixel = 0
buildButton.Text = "Reapply Lua Preview"
buildButton.TextColor3 = Color3.fromRGB(255, 255, 255)
buildButton.Font = Enum.Font.SourceSansBold
buildButton.TextSize = 16
buildButton.AutoButtonColor = true
buildButton.Active = false
buildButton.Parent = root
buildButton.ZIndex = 5

local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, 0, 0, 22)
statusLabel.BackgroundTransparency = 1
statusLabel.Text = "Ready. (HttpService must be enabled)"
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.TextColor3 = Color3.fromRGB(200, 200, 210)
statusLabel.Font = Enum.Font.SourceSans
statusLabel.TextSize = 14
statusLabel.Parent = root

local outputLabelTitle = Instance.new("TextLabel")
outputLabelTitle.Size = UDim2.new(1, 0, 0, 20)
outputLabelTitle.BackgroundTransparency = 1
outputLabelTitle.Text = "Generated Lua"
outputLabelTitle.TextXAlignment = Enum.TextXAlignment.Left
outputLabelTitle.TextColor3 = Color3.fromRGB(230, 230, 230)
outputLabelTitle.Font = Enum.Font.SourceSansSemibold
outputLabelTitle.TextSize = 16
outputLabelTitle.Parent = root

local outputFrame = Instance.new("ScrollingFrame")
outputFrame.Size = UDim2.new(1, 0, 1, -280)
outputFrame.BackgroundColor3 = Color3.fromRGB(18, 20, 25)
outputFrame.BorderSizePixel = 0
outputFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
outputFrame.ScrollBarThickness = 8
outputFrame.AutomaticCanvasSize = Enum.AutomaticSize.None
outputFrame.Parent = root
outputFrame.ZIndex = 1

local outputText = Instance.new("TextLabel")
outputText.Name = "OutputText"
outputText.BackgroundTransparency = 1
outputText.Size = UDim2.new(1, -12, 0, 0)
outputText.Position = UDim2.new(0, 6, 0, 6)
outputText.Text = ""
outputText.TextXAlignment = Enum.TextXAlignment.Left
outputText.TextYAlignment = Enum.TextYAlignment.Top
outputText.TextWrapped = true
outputText.RichText = false
outputText.Font = Enum.Font.Code
outputText.TextSize = 14
outputText.TextColor3 = Color3.fromRGB(230, 230, 230)
outputText.AutomaticSize = Enum.AutomaticSize.Y
outputText.Parent = outputFrame

local function autosizeAndScroll()
	-- TextLabel.AbsoluteSize can be 0 briefly; TextBounds is more reliable.
	local h = outputText.TextBounds.Y
	if h <= 0 then
		h = outputText.AbsoluteSize.Y
	end
	local canvasY = math.max(h + 12, outputFrame.AbsoluteWindowSize.Y)
	outputFrame.CanvasSize = UDim2.new(0, 0, 0, canvasY)
	outputFrame.CanvasPosition = Vector2.new(0, math.max(0, canvasY - outputFrame.AbsoluteWindowSize.Y))
end

local generating = false

local function setGeneratingState(isGenerating: boolean)
	generating = isGenerating
	generateButton.Active = not isGenerating
	generateButton.AutoButtonColor = not isGenerating
	generateButton.BackgroundColor3 = isGenerating and Color3.fromRGB(90, 90, 90) or Color3.fromRGB(66, 133, 244)
	generateButton.Text = isGenerating and "Building..." or "Build with AI"
end

local function updateStatus(text: string, isError: boolean?)
	statusLabel.Text = text
	if isError then
		statusLabel.TextColor3 = Color3.fromRGB(255, 120, 120)
	else
		statusLabel.TextColor3 = Color3.fromRGB(200, 200, 210)
	end
end

local function setBuildEnabled(enabled: boolean)
	buildButton.Active = enabled
	buildButton.AutoButtonColor = enabled
	buildButton.BackgroundColor3 = enabled and Color3.fromRGB(34, 197, 94) or Color3.fromRGB(20, 60, 40)
end

local function safeGetJson(url: string): (boolean, any)
	local ok, response = pcall(function()
		return HttpService:GetAsync(url, false)
	end)
	if not ok then
		return false, "HTTP request failed: " .. tostring(response)
	end

	local decodeOk, data = pcall(function()
		return HttpService:JSONDecode(response)
	end)
	if not decodeOk then
		return false, "JSON decode failed: " .. tostring(data)
	end

	return true, data
end

local function safeGetJsonAuthorized(url: string, bearerToken: string): (boolean, any)
	local ok, result = pcall(function()
		return HttpService:RequestAsync({
			Url = url,
			Method = "GET",
			Headers = {
				Authorization = "Bearer " .. bearerToken,
			},
		})
	end)
	if not ok then
		return false, "HTTP request failed: " .. tostring(result)
	end
	if not result.Success then
		local code = result.StatusCode or 0
		local body = tostring(result.Body or "")
		return false, "HTTP " .. tostring(code) .. ": " .. body
	end
	local decodeOk, data = pcall(function()
		return HttpService:JSONDecode(result.Body)
	end)
	if not decodeOk then
		return false, "JSON decode failed: " .. tostring(data)
	end
	return true, data
end

local function safePostJson(url: string, payload: {[any]: any}): (boolean, any)
	local ok, response = pcall(function()
		local body = HttpService:JSONEncode(payload or {})
		return HttpService:PostAsync(url, body, Enum.HttpContentType.ApplicationJson, false)
	end)
	if not ok then
		return false, "HTTP request failed: " .. tostring(response)
	end

	local decodeOk, data = pcall(function()
		return HttpService:JSONDecode(response)
	end)
	if not decodeOk then
		return false, "JSON decode failed: " .. tostring(data)
	end

	return true, data
end

local function isScriptObject(inst: Instance): boolean
	return inst:IsA("Script") or inst:IsA("LocalScript") or inst:IsA("ModuleScript")
end

local function getInstancePath(inst: Instance): string
	local parts = {}
	local current: Instance? = inst
	while current ~= nil and current ~= game do
		table.insert(parts, 1, current.Name)
		current = current.Parent
	end
	return table.concat(parts, "/")
end

local function buildStudioSnapshot(): string
	local lines = {
		"Roblox Studio snapshot:",
	}
	local lineCount = 0
	local maxLines = 180
	local maxDepth = 3

	local function pushLine(line: string)
		if lineCount >= maxLines then
			return
		end
		lineCount += 1
		table.insert(lines, line)
	end

	local selected = Selection:Get()
	if #selected > 0 then
		pushLine("Selected instances:")
		for _, inst in ipairs(selected) do
			pushLine("- " .. getInstancePath(inst) .. " [" .. inst.ClassName .. "]")
		end
	end

	local roots = {
		game:GetService("ServerScriptService"),
		game:GetService("ReplicatedStorage"),
		game:GetService("StarterGui"),
		game:GetService("StarterPlayer"),
		workspace,
	}

	local function visit(inst: Instance, depth: number)
		if lineCount >= maxLines or depth > maxDepth then
			return
		end
		local indent = string.rep("  ", depth)
		pushLine(indent .. "- " .. getInstancePath(inst) .. " [" .. inst.ClassName .. "]")
		if isScriptObject(inst) then
			local ok, source = pcall(function()
				return inst.Source
			end)
			if ok and type(source) == "string" and source ~= "" then
				local preview = source:gsub("\r\n", "\n")
				if #preview > 280 then
					preview = string.sub(preview, 1, 280) .. "..."
				end
				preview = preview:gsub("\n", "\\n")
				pushLine(indent .. "  source=" .. preview)
			end
		end
		if depth >= maxDepth then
			return
		end
		for _, child in ipairs(inst:GetChildren()) do
			if lineCount >= maxLines then
				return
			end
			visit(child, depth + 1)
		end
	end

	for _, rootInst in ipairs(roots) do
		visit(rootInst, 0)
		if lineCount >= maxLines then
			break
		end
	end

	return table.concat(lines, "\n")
end

local function startBuildSession(promptText: string, studioSnapshot: string): (boolean, string)
	local url = BASE_URL .. BUILD_START_ENDPOINT
	local payload = {
		prompt = promptText,
		studio_snapshot = studioSnapshot,
		max_tokens = 2600,
	}

	local ok, dataOrErr = safePostJson(url, payload)
	if not ok then
		return false, tostring(dataOrErr)
	end

	local data = dataOrErr
	if type(data) ~= "table" or type(data.stream_id) ~= "string" then
		return false, "Invalid /build/start response (missing stream_id)"
	end

	return true, data.stream_id
end

local function fetchBuildStream(streamId: string, cursor: number): (boolean, any)
	local encodedId = HttpService:UrlEncode(streamId)
	local url = BASE_URL
		.. BUILD_STREAM_ENDPOINT
		.. "?stream_id="
		.. encodedId
		.. "&cursor="
		.. tostring(cursor)

	local ok, dataOrError = safeGetJson(url)
	if not ok then
		return false, tostring(dataOrError)
	end

	local data = dataOrError
	if type(data) ~= "table" or type(data.events) ~= "table" or type(data.next_cursor) ~= "number" then
		return false, "Invalid /build/stream response"
	end

	return true, data
end

local function splitPath(path: string): { string }
	local parts = {}
	for part in string.gmatch(path, "[^/]+") do
		table.insert(parts, part)
	end
	return parts
end

local function getServiceRoot(serviceName: string): Instance?
	if serviceName == "Workspace" then
		return workspace
	end
	local ok, svc = pcall(function()
		return game:GetService(serviceName)
	end)
	if ok and svc then
		return svc
	end
	return nil
end

local function ensureFolder(parent: Instance, name: string): Instance
	local existing = parent:FindFirstChild(name)
	if existing and existing:IsA("Folder") then
		return existing
	end
	local folder = Instance.new("Folder")
	folder.Name = name
	folder.Parent = parent
	return folder
end

local function ensureChildOfClass(parent: Instance, name: string, className: string): (Instance, boolean)
	local existing = parent:FindFirstChild(name)
	if existing and existing:IsA(className) then
		return existing, false
	end
	if existing then
		existing:Destroy()
	end
	local child = Instance.new(className)
	child.Name = name
	child.Parent = parent
	return child, true
end

local function findInstanceByPath(path: string): Instance?
	local parts = splitPath(path)
	if #parts == 0 then
		return nil
	end
	local current = getServiceRoot(parts[1])
	if current == nil then
		return nil
	end
	for i = 2, #parts do
		current = current:FindFirstChild(parts[i])
		if current == nil then
			return nil
		end
	end
	return current
end

local function ensureParentForPath(path: string): (Instance?, string?)
	local parts = splitPath(path)
	if #parts < 2 then
		return nil, "Path must include a service root and instance name: " .. path
	end
	local rootInst = getServiceRoot(parts[1])
	if rootInst == nil then
		return nil, "Unknown root service: " .. parts[1]
	end
	local parent: Instance = rootInst
	for i = 2, #parts - 1 do
		parent = ensureFolder(parent, parts[i])
	end
	return parent, nil
end

local function decodePropertyValue(valueJson: string): any
	local ok, decoded = pcall(function()
		return HttpService:JSONDecode(valueJson)
	end)
	if not ok then
		return valueJson
	end
	if type(decoded) ~= "table" then
		return decoded
	end

	local rbxType = decoded.rbx_type
	if rbxType == "Color3" then
		return Color3.fromRGB(tonumber(decoded.r) or 255, tonumber(decoded.g) or 255, tonumber(decoded.b) or 255)
	end
	if rbxType == "Vector3" then
		return Vector3.new(tonumber(decoded.x) or 0, tonumber(decoded.y) or 0, tonumber(decoded.z) or 0)
	end
	if rbxType == "UDim2" then
		return UDim2.new(
			tonumber(decoded.xScale) or 0,
			tonumber(decoded.xOffset) or 0,
			tonumber(decoded.yScale) or 0,
			tonumber(decoded.yOffset) or 0
		)
	end
	return decoded
end

local function applyProperties(target: Instance, properties: { [number]: any }?): (number, { string })
	local updated = 0
	local failures: { string } = {}
	if type(properties) ~= "table" then
		return updated, failures
	end
	for _, prop in ipairs(properties) do
		local propName = if type(prop) == "table" then tostring(prop.name or "") else ""
		local valueJson = if type(prop) == "table" then tostring(prop.value_json or "") else ""
		if propName ~= "" then
			local value = decodePropertyValue(valueJson)
			local ok, err = pcall(function()
				target[propName] = value
			end)
			if ok then
				updated += 1
			else
				table.insert(failures, target:GetFullName() .. "." .. propName .. ": " .. tostring(err))
			end
		end
	end
	return updated, failures
end

local function setScriptSource(obj, sourceText: string)
	-- Keep assignment in a helper so old Luau parser versions do not
	-- misread cast+dot expressions as ambiguous syntax.
	obj.Source = sourceText
end

local function parseScriptSections(luaText: string): { { path: string, source: string } }
	local text = tostring(luaText or "")
	text = text:gsub("\r\n", "\n")
	text = text:gsub("%-%- END%s*$", "")

	local sections: { { path: string, source: string } } = {}
	local currentPath: string? = nil
	local currentLines: { string } = {}

	local function pushCurrent()
		if currentPath == nil then
			return
		end
		local code = table.concat(currentLines, "\n")
		if code:match("%S") then
			table.insert(sections, { path = currentPath :: string, source = code })
		end
		currentPath = nil
		currentLines = {}
	end

	for line in text:gmatch("([^\n]*)\n?") do
		local headerPath = line:match("^%s*%-%-%s*Script:%s*(.+)%s*$")
		if headerPath ~= nil then
			pushCurrent()
			currentPath = headerPath
		elseif currentPath ~= nil then
			if string.find(line, "%-%- END", 1, false) then
				break
			end
			table.insert(currentLines, line)
		end
	end

	pushCurrent()

	-- Fallback for the `/stream` endpoint:
	-- The streaming system prompt may NOT include `-- Script: ...` headers.
	-- If no headers were found, install the entire text as one script so
	-- "Build into Explorer" always works after Generate.
	if #sections == 0 then
		local trimmed = text:match("^%s*(.-)%s*$") or ""
		if trimmed ~= "" then
			table.insert(sections, {
				path = "ServerScriptService/VibeCoderScript",
				source = trimmed,
			})
		end
	end

	return sections
end

local function installFromGeneratedLua(luaText: string): (boolean, string)
	local sections = parseScriptSections(luaText)
	if #sections == 0 then
		return false, "No `-- Script: <Service>/<Path>` sections found in the generated Lua."
	end

	local created = 0
	local updated = 0
	local failures: { string } = {}

	plugin:Activate(true)

	local function tryInstall()
		for _, entry in ipairs(sections) do
			local path = tostring(entry.path or "")
			local source = tostring(entry.source or "")
			if path == "" or source == "" then
				table.insert(failures, "Missing path/source for one section.")
			else
				local parts = splitPath(path)
				if #parts < 2 then
					table.insert(failures, "Invalid script path: " .. path)
				else
					local rootName = parts[1]
					local rootInst = getServiceRoot(rootName)
					if rootInst == nil then
						table.insert(failures, "Unknown root: " .. rootName .. " (path: " .. path .. ")")
					else
						local parent: Instance = rootInst
						for i = 2, #parts - 1 do
							parent = ensureFolder(parent, parts[i])
						end

						local scriptName = parts[#parts]
						local className = "Script"
						if rootName == "StarterGui" or rootName == "StarterPlayerScripts" or rootName == "StarterCharacterScripts" then
							className = "LocalScript"
						end

						local existing = parent:FindFirstChild(scriptName)
						if existing and existing:IsA(className) then
							setScriptSource(existing, source)
							updated = updated + 1
						else
							if existing then
								existing:Destroy()
							end
							local scriptObj = Instance.new(className)
							scriptObj.Name = scriptName
							setScriptSource(scriptObj, source)
							scriptObj.Parent = parent
							created = created + 1
						end
					end
				end
			end
		end
	end

	local okHistory = pcall(function()
		StudioService:RecordUndo("VibeCoder Build", function()
			tryInstall()
		end);
	end)

	if not okHistory then
		local ok, err = pcall(tryInstall)
		if not ok then
			return false, "Install failed: " .. tostring(err)
		end
	end

	if #failures > 0 then
		local msg = string.format(
			"Created %d, Updated %d. Some failed: %s",
			created,
			updated,
			table.concat(failures, "; ")
		)
		return true, msg
	end
	return true, string.format("Created %d, Updated %d. Done!", created, updated)
end

local function applyBuildOperations(operations: { [number]: any }): (boolean, string)
	local created = 0
	local updated = 0
	local deleted = 0
	local failures: { string } = {}

	plugin:Activate(true)

	local function tryApply()
		for _, op in ipairs(operations) do
			if type(op) ~= "table" then
				table.insert(failures, "Skipped invalid operation payload.")
				continue
			end

			local opType = tostring(op.type or "")
			local path = tostring(op.path or "")
			if path == "" then
				table.insert(failures, "Operation missing path.")
				continue
			end

			if opType == "upsert_script" then
				local parent, parentErr = ensureParentForPath(path)
				if parent == nil then
					table.insert(failures, tostring(parentErr))
					continue
				end
				local parts = splitPath(path)
				local scriptName = parts[#parts]
				local className = tostring(op.class_name or "Script")
				local source = tostring(op.source or "")
				local existing = parent:FindFirstChild(scriptName)
				if existing and existing:IsA(className) then
					setScriptSource(existing, source)
					updated += 1
				else
					if existing then
						existing:Destroy()
					end
					local scriptObj = Instance.new(className)
					scriptObj.Name = scriptName
					setScriptSource(scriptObj, source)
					scriptObj.Parent = parent
					created += 1
				end
			elseif opType == "ensure_instance" then
				local parent, parentErr = ensureParentForPath(path)
				if parent == nil then
					table.insert(failures, tostring(parentErr))
					continue
				end
				local parts = splitPath(path)
				local instName = parts[#parts]
				local className = tostring(op.class_name or "Folder")
				local target, wasCreated = ensureChildOfClass(parent, instName, className)
				local propUpdates, propFailures = applyProperties(target, op.properties)
				if wasCreated then
					created += 1
				end
				updated += propUpdates
				for _, failure in ipairs(propFailures) do
					table.insert(failures, failure)
				end
			elseif opType == "set_properties" then
				local target = findInstanceByPath(path)
				if target == nil then
					table.insert(failures, "Instance not found for set_properties: " .. path)
					continue
				end
				local propUpdates, propFailures = applyProperties(target, op.properties)
				updated += propUpdates
				for _, failure in ipairs(propFailures) do
					table.insert(failures, failure)
				end
			elseif opType == "delete_instance" then
				local target = findInstanceByPath(path)
				if target ~= nil then
					target:Destroy()
					deleted += 1
				end
			else
				table.insert(failures, "Unsupported operation type: " .. opType)
			end
		end
	end

	local okHistory = pcall(function()
		StudioService:RecordUndo("AI Game Builder Batch", function()
			tryApply()
		end)
	end)

	if not okHistory then
		local ok, err = pcall(tryApply)
		if not ok then
			return false, "Build operations failed: " .. tostring(err)
		end
	end

	if #failures > 0 then
		return true, string.format(
			"Applied batch: created %d, updated %d, deleted %d. Some issues: %s",
			created,
			updated,
			deleted,
			table.concat(failures, "; ")
		)
	end

	return true, string.format("Applied batch: created %d, updated %d, deleted %d.", created, updated, deleted)
end

local function processBuildEvent(event: any): (boolean, string)
	if type(event) ~= "table" then
		return false, "Invalid build event payload."
	end

	local eventType = tostring(event.type or "")
	if eventType == "status" then
		local message = tostring(event.message or "Working...")
		updateStatus(message, false)
		return true, message
	end

	if eventType == "preview" then
		local combinedLua = tostring(event.combined_lua or "")
		if combinedLua ~= "" then
			outputText.Text = combinedLua
			autosizeAndScroll()
			setBuildEnabled(canBuildNow())
		end
		local summary = tostring(event.summary or "Plan ready.")
		updateStatus(summary, false)
		return true, summary
	end

	if eventType == "operation_batch" then
		local okApply, msg = applyBuildOperations(event.operations or {})
		updateStatus(tostring(event.message or msg), not okApply)
		return okApply, msg
	end

	if eventType == "complete" then
		local combinedLua = tostring(event.combined_lua or "")
		if combinedLua ~= "" then
			outputText.Text = combinedLua
			autosizeAndScroll()
		end
		setBuildEnabled(canBuildNow())
		local operationCount = tonumber(event.operation_count) or 0
		local message = string.format("Build complete. %d operations streamed.", operationCount)
		updateStatus(message, false)
		return true, message
	end

	return true, "Ignored event: " .. eventType
end

local function canBuildNow(): boolean
	local txt = outputText.Text or ""
	if txt == "" then
		return false
	end
	local ok, sections = pcall(function()
		return parseScriptSections(txt)
	end)
	if not ok or type(sections) ~= "table" then
		return false
	end
	return #sections > 0
end

local function getSyncKey(): string
	local key = tostring(syncKeyBox.Text or "")
	key = key:gsub("^%s+", ""):gsub("%s+$", "")
	if key == "" then
		return "default"
	end
	return key
end

local function fetchSyncLatest(syncKey: string): (boolean, any)
	local token = tostring(syncTokenBox.Text or ""):gsub("^%s+", ""):gsub("%s+$", "")
	if token == "" then
		return false, "missing sync token"
	end
	local encodedKey = HttpService:UrlEncode(syncKey)
	local url = BASE_URL .. SYNC_LATEST_ENDPOINT .. "?sync_key=" .. encodedKey
	return safeGetJsonAuthorized(url, token)
end

local function applySyncedPayload(payload: any): (boolean, string)
	if type(payload) ~= "table" then
		return false, "Invalid sync payload."
	end

	-- Prefer structured operations. If only `combined_lua` is provided, install it.
	local operations = payload.operations
	local combinedLua = payload.combined_lua

	if combinedLua ~= nil and tostring(combinedLua) ~= "" then
		outputText.Text = tostring(combinedLua)
		autosizeAndScroll()
		setBuildEnabled(canBuildNow())
	end

	if type(operations) == "table" and #operations > 0 then
		return applyBuildOperations(operations)
	end

	if combinedLua ~= nil and tostring(combinedLua) ~= "" then
		return installFromGeneratedLua(tostring(combinedLua))
	end

	return false, "Sync payload missing operations and combined_lua."
end

local generationToken = 0

local function runGeneration(prompt: string)
	generationToken = generationToken + 1
	local myToken = generationToken

	setGeneratingState(true)
	setBuildEnabled(false)
	updateStatus("Capturing Studio snapshot...", false)
	outputText.Text = ""
	autosizeAndScroll()

	local studioSnapshot = buildStudioSnapshot()
	updateStatus("Starting build session...", false)

	local okStart, streamIdOrErr = startBuildSession(prompt, studioSnapshot)
	if myToken ~= generationToken then
		setGeneratingState(false)
		return
	end
	if not okStart then
		updateStatus("Build failed: " .. tostring(streamIdOrErr), true)
		setGeneratingState(false)
		return
	end

	local streamId = streamIdOrErr
	local cursor = 0
	local idleCycles = 0

	while myToken == generationToken do
		local okPoll, dataOrErr = fetchBuildStream(streamId, cursor)
		if not okPoll then
			updateStatus("Build stream failed: " .. tostring(dataOrErr), true)
			setGeneratingState(false)
			setBuildEnabled(canBuildNow())
			return
		end

		local data = dataOrErr
		local events = data.events or {}
		if #events > 0 then
			idleCycles = 0
			for _, event in ipairs(events) do
				if myToken ~= generationToken then
					setGeneratingState(false)
					return
				end
				local okEvent, eventMsg = processBuildEvent(event)
				if not okEvent then
					updateStatus("Build failed: " .. tostring(eventMsg), true)
					setGeneratingState(false)
					setBuildEnabled(canBuildNow())
					return
				end
			end
			cursor = tonumber(data.next_cursor) or (cursor + #events)
		else
			idleCycles += 1
		end

		local streamError = data.error
		if type(streamError) == "string" and streamError ~= "" then
			updateStatus("Build failed: " .. streamError, true)
			setGeneratingState(false)
			setBuildEnabled(canBuildNow())
			return
		end

		if data.done == true and cursor >= (tonumber(data.next_cursor) or cursor) then
			break
		end
		if idleCycles >= MAX_IDLE_CYCLES then
			updateStatus("Build timed out waiting for more events.", true)
			setGeneratingState(false)
			setBuildEnabled(canBuildNow())
			return
		end
		task.wait(POLL_INTERVAL)
	end

	setGeneratingState(false)
end

generateButton.MouseButton1Click:Connect(function()
	local prompt = (promptBox.Text or ""):gsub("^%s+", ""):gsub("%s+$", "")
	if prompt == "" then
		updateStatus("Please enter a prompt first.", true)
		return
	end

	task.spawn(function()
		local ok, err = pcall(function()
			runGeneration(prompt)
		end)
		if not ok then
			updateStatus("Build failed: " .. tostring(err), true)
			setGeneratingState(false)
			setBuildEnabled(false)
		end
	end);
end)

buildButton.MouseButton1Click:Connect(function()
	if not canBuildNow() then
		updateStatus("Nothing to reapply yet (need -- Script: headers). Build first.", true)
		return
	end

	local okInstall, msg = installFromGeneratedLua(outputText.Text)
	if okInstall then
		updateStatus(msg, false)
	else
		updateStatus(msg, true)
	end
end)

pcall(function()
	local t = plugin:GetSetting("AIGameBuilderSyncBearer")
	if type(t) == "string" then
		syncTokenBox.Text = t
	end
end)
syncTokenBox.FocusLost:Connect(function()
	pcall(function()
		plugin:SetSetting("AIGameBuilderSyncBearer", syncTokenBox.Text)
	end)
end)

-- Background auto-sync: platform pushes updates via POST /sync/push.
-- Studio plugin polls GET /sync/latest and applies when version changes.
task.spawn(function()
	local lastVersion = ""
	while true do
		if widget.Enabled and not generating then
			local syncKey = getSyncKey()
			local ok, dataOrErr = fetchSyncLatest(syncKey)
			-- If backend doesn't have data yet, ignore.
			if ok and type(dataOrErr) == "table" then
				local versionStr = tostring(dataOrErr.version or "")
				if versionStr ~= "" and versionStr ~= lastVersion then
					updateStatus("Sync: applying version " .. versionStr .. "...", false)
					local okApply, msg = applySyncedPayload(dataOrErr)
					if okApply then
						lastVersion = versionStr
						updateStatus("Sync applied: " .. tostring(msg), false)
					else
						updateStatus("Sync failed: " .. tostring(msg), true)
					end
				end
			end
		end
		task.wait(SYNC_POLL_INTERVAL)
	end
end)
