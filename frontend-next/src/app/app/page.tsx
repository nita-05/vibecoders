"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { TopNav } from "@/components/TopNav";
import { apiBase, apiFetch } from "@/lib/api";

type GeneratedScript = {
  lua_code: string;
  description: string;
  setup_steps?: string[] | null;
};

type GenerateScriptResponse = {
  script: GeneratedScript;
};

type RefineScriptResponse = {
  script: GeneratedScript;
  change_summary?: string[] | null;
};

type Project = { id: string; name: string; description?: string };
type HistoryEntry = {
  prompt: string;
  style: string | null;
  description: string;
  lua_code: string;
  setup_steps: string[] | null;
  ts: number;
};
type SafetyState = { label: string; tone: "good" | "warn" };

const PROJECTS_KEY = "vb-local-projects";
const CURRENT_PROJECT_KEY = "vb-local-current-project";
const HISTORY_KEY_BASE = "vibe-coding-history";
const MAX_HISTORY = 10;

const TEMPLATES = [
  {
    title: "Full Game: Coin Collector",
    pill: "full game",
    desc: "Collect coins, score Points, timer, win screen.",
    prompt: [
      "Build a small complete Roblox coin-collector game (MVP) using Roblox Lua.",
      "",
      "Requirements (implement all of these, but nothing extra):",
      "- Use leaderstats named Points (default 0).",
      "- Spawn 15 coins around the map (Workspace) at random positions within a reasonable radius of SpawnLocation.",
      "- When a player touches a coin, the coin disappears and the player gets +1 Point.",
      "- Respawn that coin after 5 seconds at a new random position.",
      "- Add a 60-second round timer. When time ends, show a simple ScreenGui to each player: \"Time's up! You collected X coins.\"",
      "- Reset Points to 0 when a new round starts.",
      "",
      "Structure: if you need multiple scripts, output them in one lua_code with clear section headers like: -- Script: ServerScriptService/GameManager, -- Script: ServerScriptService/CoinSpawner, -- Script: StarterGui/ResultGui.",
      "Keep code minimal but complete and working."
    ].join("\n")
  },
  {
    title: "Full Game: Escape from Zombies",
    pill: "full game",
    desc: "Zombies chase players; survive to win.",
    prompt: [
      "Build a small complete Roblox 'escape from zombies' game (MVP) using Roblox Lua.",
      "",
      "Requirements (implement all of these, but nothing extra):",
      "- There is a Folder in Workspace named Zombies that contains 5 NPC zombie models (Rig with Humanoid + HumanoidRootPart).",
      "- Each zombie should continuously chase the nearest player using PathfindingService.",
      "- If a zombie touches a player, that player's Humanoid takes 15 damage (with a short cooldown so it doesn't spam damage every frame).",
      "- Add a 90-second survival timer. If the player survives until the timer ends, show a simple ScreenGui: \"You survived!\" If they die, show: \"You were caught!\"",
      "- Optional but allowed: award +1 Point every 10 seconds survived (leaderstats named Points).",
      "",
      "Structure: if you need multiple scripts, output them in one lua_code with clear section headers like: -- Script: ServerScriptService/ZombieAI, -- Script: ServerScriptService/SurvivalTimer, -- Script: StarterGui/EndScreenGui.",
      "Keep code minimal but complete and working."
    ].join("\n")
  }
] as const;

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Could not read image"));
    r.readAsDataURL(file);
  });
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function loadLocalProjects(): Project[] {
  const raw = localStorage.getItem(PROJECTS_KEY) || "[]";
  const parsed = safeJsonParse<Project[]>(raw, []);
  if (Array.isArray(parsed) && parsed.length) return parsed;
  const def: Project[] = [{ id: "default", name: "Default", description: "" }];
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(def));
  return def;
}

function saveLocalProjects(list: Project[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list || []));
}

function historyKey(projectId: string | null | undefined) {
  const pid = (projectId || "default").trim() || "default";
  return `${HISTORY_KEY_BASE}:${pid}`;
}

function loadHistory(projectId: string | null): HistoryEntry[] {
  const raw = localStorage.getItem(historyKey(projectId));
  const parsed = safeJsonParse<HistoryEntry[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveHistoryEntry(projectId: string, entry: Omit<HistoryEntry, "ts">) {
  const key = historyKey(projectId);
  const list = loadHistory(projectId);
  const withTs: HistoryEntry = { ...entry, ts: Date.now() };
  list.unshift(withTs);
  const trimmed = list.slice(0, MAX_HISTORY);
  localStorage.setItem(key, JSON.stringify(trimmed));
  return trimmed;
}

function removeHistoryIndex(projectId: string, index: number) {
  const list = loadHistory(projectId);
  if (index < 0 || index >= list.length) return list;
  list.splice(index, 1);
  localStorage.setItem(historyKey(projectId), JSON.stringify(list));
  return list;
}

function parseLuaScriptSections(luaText: string) {
  const text = String(luaText || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const headerRe = /^\s*--\s*Script:\s*(.+?)\s*$/i;
  const out: { path: string; code: string }[] = [];
  let current: { path: string; codeLines: string[] } | null = null;

  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (current) out.push({ path: current.path, code: current.codeLines.join("\n").trim() });
      current = { path: m[1].trim(), codeLines: [] };
      continue;
    }

    if (!current) current = { path: "ServerScriptService/VibeCoderScript", codeLines: [] };
    current.codeLines.push(line);
  }

  if (current) out.push({ path: current.path, code: current.codeLines.join("\n").trim() });
  return out.filter((s) => s.code);
}

function computeSafety(luaText: string): SafetyState {
  const text = String(luaText || "").toLowerCase();
  let score = 0;
  const riskyPatterns: RegExp[] = [
    /:destroy\s*\(/i,
    /game\.players:kick/i,
    /datastoreservice/i,
    /while\s+true\s+do/i
  ];

  for (const re of riskyPatterns) {
    if (re.test(text)) score += 1;
  }
  const lines = text.split("\n").length;
  if (lines > 200) score += 1;

  if (score === 0) return { label: "Looks safe", tone: "good" };
  return { label: "Review first", tone: "warn" };
}

function downloadTextFile(text: string, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function fallbackCopyText(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

function parseSseDataChunk(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() || "";
  const events: string[] = [];
  for (const event of parts) {
    const lines = event.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) events.push(line.slice(6));
    }
  }
  return { events, rest };
}

export default function AppBuilderPage() {
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const AUTH_KEY = "vibecoder-auth-token";
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authInputEmail, setAuthInputEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string>("");
  const logoutRequestedRef = useRef(false);

  useEffect(() => {
    async function loadAndVerify() {
      try {
        if (logoutRequestedRef.current) return;
        const token = localStorage.getItem(AUTH_KEY);
        const candidate = token ? String(token) : null;
        if (!candidate) {
          setAuthToken(null);
          setAuthEmail(null);
          return;
        }

        // Verify token is still valid; otherwise force sign-in.
        const res = await fetch(apiBase() + "/auth/me", {
          method: "GET",
          headers: { Authorization: "Bearer " + candidate },
        });

        if (!res.ok) {
          localStorage.removeItem(AUTH_KEY);
          setAuthToken(null);
          setAuthEmail(null);
          return;
        }

        // Grab email for UI display.
        const me = (await res.json().catch(() => null)) as { email?: string } | null;
        if (logoutRequestedRef.current) return;
        setAuthEmail(me?.email ? String(me.email) : null);
        if (logoutRequestedRef.current) return;
        setAuthToken(candidate);
      } catch {
        if (logoutRequestedRef.current) return;
        setAuthToken(null);
        setAuthEmail(null);
      } finally {
        if (!logoutRequestedRef.current) setAuthLoaded(true);
      }
    }

    void loadAndVerify();
  }, []);

  async function doAuth(mode: "login" | "signup") {
    setAuthError("");
    const email = (authInputEmail || "").trim();
    const password = (authPassword || "").trim();

    if (!email) {
      setAuthError("Enter your email.");
      return;
    }
    if (!password) {
      setAuthError("Enter your password.");
      return;
    }

    setAuthBusy(true);
    try {
      const endpoint = mode === "signup" ? "/auth/signup" : "/auth/login";
      const res = await fetch(apiBase() + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({} as { detail?: string; access_token?: string }));
      if (!res.ok) {
        throw new Error(data?.detail || "Authentication failed");
      }
      const token = data?.access_token;
      if (!token) throw new Error("No access token returned.");

      localStorage.setItem(AUTH_KEY, token);
      setAuthToken(token);

      // Fetch profile email for UI display.
      try {
        const meRes = await fetch(apiBase() + "/auth/me", {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
        });
        if (meRes.ok) {
          const me = await meRes.json().catch(() => null) as { email?: string } | null;
          setAuthEmail(me?.email ? String(me.email) : null);
        } else {
          setAuthEmail(null);
        }
      } catch {
        setAuthEmail(null);
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  function logout() {
    logoutRequestedRef.current = true;
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      // ignore
    }
    setAuthToken(null);
    setAuthError("");
    setAuthMode("login");
  }

  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>("default");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [lua, setLua] = useState("");
  const [description, setDescription] = useState("");
  const [setupSteps, setSetupSteps] = useState<string[] | null>(null);

  const [placementSummary, setPlacementSummary] = useState("");
  const [safety, setSafety] = useState<SafetyState>({ label: "Looks safe", tone: "good" });
  const [changeSummary, setChangeSummary] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [pfName, setPfName] = useState("");
  const [pfDescription, setPfDescription] = useState("");

  const [activeRecipe, setActiveRecipe] = useState<"powerup" | "coin" | null>(null);
  const [recipeEffect, setRecipeEffect] = useState<"health" | "speed" | "jump">("health");
  const [recipeAmount, setRecipeAmount] = useState<string>("10");
  const [recipePartName, setRecipePartName] = useState<string>("PowerUpPart");
  const [recipeCoinPoints, setRecipeCoinPoints] = useState<string>("1");
  const [recipeCoinName, setRecipeCoinName] = useState<string>("Coin");

  useEffect(() => {
    const loadedProjects = loadLocalProjects();
    setProjects(loadedProjects);

    const storedProjectId = localStorage.getItem(CURRENT_PROJECT_KEY);
    const validStored = loadedProjects.some((p) => p.id === storedProjectId);
    const pid = validStored ? (storedProjectId as string) : loadedProjects[0]?.id || "default";
    setCurrentProjectId(pid);
    localStorage.setItem(CURRENT_PROJECT_KEY, pid);

    setHistory(loadHistory(pid));
  }, []);

  useEffect(() => {
    if (!currentProjectId) return;
    setHistory(loadHistory(currentProjectId));
  }, [currentProjectId]);

  const currentProjectName = useMemo(() => {
    const p = projects.find((x) => x.id === currentProjectId);
    return p?.name || "Default";
  }, [projects, currentProjectId]);

  const canSubmit = useMemo(() => prompt.trim().length > 0 && !loading, [prompt, loading]);

  function updatePlacementAndSafety(luaText: string) {
    const sections = parseLuaScriptSections(luaText);
    if (!sections.length) {
      setPlacementSummary("");
    } else {
      const parts = sections.map((s) => s.path);
      setPlacementSummary(`Placement: ${parts.join(" • ")}`);
    }
    setSafety(computeSafety(luaText));
  }

  async function onGenerate() {
    setError("");
    setLoading(true);
    try {
      const picked = files.slice(0, 2);
      for (const f of picked) {
        if (f.size > 4 * 1024 * 1024) throw new Error(`Image too large: ${f.name} (max 4MB)`);
      }
      const image_data_list = picked.length ? await Promise.all(picked.map(toDataUrl)) : null;

      // For text-only prompts, use SSE streaming endpoint for ChatGPT-like live output.
      if (!image_data_list || image_data_list.length === 0) {
        setLua("");
        setDescription("");
        setSetupSteps(null);
        setChangeSummary(null);

        const streamUrl =
          `${apiBase()}/generate?prompt=${encodeURIComponent(prompt)}&t=${Date.now()}`;
        let finalLua = "";
        await new Promise<void>((resolve, reject) => {
          const source = new EventSource(streamUrl);

          source.onmessage = (event) => {
            const data = event.data || "";
            if (data === "[DONE]") {
              source.close();
              resolve();
              return;
            }
            if (data.startsWith("[ERROR]")) {
              source.close();
              reject(new Error(data.replace(/^\[ERROR\]\s*/, "") || "Streaming failed"));
              return;
            }
            const chunk = data.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
            finalLua += chunk;
            setLua(finalLua);
          };

          source.onerror = () => {
            source.close();
            reject(new Error("Stream disconnected. Please retry."));
          };
        });

        updatePlacementAndSafety(finalLua);
        const updated = saveHistoryEntry(currentProjectId, {
          prompt,
          style: null,
          description: "",
          lua_code: finalLua,
          setup_steps: null
        });
        setHistory(updated);
      } else {
        // Keep existing JSON endpoint for image-assisted generation.
        const res = await apiFetch<GenerateScriptResponse>("/generate-script", {
          method: "POST",
          body: JSON.stringify({ prompt, style: null, max_tokens: 1500, image_data_list })
        });
        if (!res.ok) throw new Error(res.errorJson?.detail || "Failed to generate script");

        const outLua = res.data.script.lua_code || "";
        const outDesc = res.data.script.description || "";
        const outSetup = res.data.script.setup_steps || null;

        setLua(outLua);
        setDescription(outDesc);
        setSetupSteps(outSetup);
        setChangeSummary(null);
        updatePlacementAndSafety(outLua);

        const updated = saveHistoryEntry(currentProjectId, {
          prompt,
          style: null,
          description: outDesc,
          lua_code: outLua,
          setup_steps: outSetup
        });
        setHistory(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function onRefine() {
    if (!lua.trim()) {
      setError("Generate code first, then ask for improvements in Prompt and click Refine Existing Game.");
      return;
    }
    if (!prompt.trim()) {
      setError("Enter improvement request in Prompt before refining.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      setDescription("");
      setSetupSteps(null);
      setChangeSummary(null);
      const prevLua = lua;
      let streamedLua = "";
      const response = await fetch(`${apiBase()}/refine-script/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_lua_code: prevLua,
          refinement_request: prompt,
          max_tokens: 1500
        }),
        cache: "no-store"
      });
      if (!response.ok || !response.body) {
        throw new Error(`Failed to refine script (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseDataChunk(buffer);
        buffer = parsed.rest;
        for (const data of parsed.events) {
          if (data === "[DONE]") {
            continue;
          }
          if (data.startsWith("[ERROR]")) {
            throw new Error(data.replace(/^\[ERROR\]\s*/, "") || "Refine streaming failed");
          }
          const chunk = data.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
          streamedLua += chunk;
          setLua(streamedLua);
        }
      }

      const finalLua = streamedLua.trim() ? streamedLua : prevLua;
      setLua(finalLua);
      updatePlacementAndSafety(finalLua);

      const updated = saveHistoryEntry(currentProjectId, {
        prompt,
        style: null,
        description: "",
        lua_code: finalLua,
        setup_steps: null
      });
      setHistory(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function onCopy() {
    const text = lua.trim();
    if (!text) {
      setError("Nothing to copy yet.");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setError("");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
      const ok = fallbackCopyText(text);
      if (!ok) throw new Error("Copy not supported in this browser context.");
      setError("");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ok = fallbackCopyText(text);
      if (ok) {
        setError("");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
      setError("Copy failed. Browser blocked clipboard access. Try Ctrl+C.");
    }
  }

  function onDownload() {
    const text = lua.trim();
    if (!text) return;
    const filename = `${currentProjectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-game.lua`.slice(0, 60);
    downloadTextFile(text, filename);
  }

  function applyTemplate(text: string) {
    setPrompt(text);
    if (promptRef.current) promptRef.current.focus();
    setFiles([]);
    setError("");
  }

  function loadHistoryEntry(entry: HistoryEntry) {
    setPrompt(entry.prompt || "");
    setLua(entry.lua_code || "");
    setDescription(entry.description || "");
    setSetupSteps(entry.setup_steps || null);
    updatePlacementAndSafety(entry.lua_code || "");
    setError("");
  }

  function createProject() {
    const name = (pfName || "").trim();
    const description = (pfDescription || "").trim();
    if (!name) return;

    const id = `p_${Math.random().toString(36).slice(2, 10)}`;
    const next: Project[] = [{ id, name, description }, ...projects];
    saveLocalProjects(next);
    setProjects(next);
    localStorage.setItem(CURRENT_PROJECT_KEY, id);
    setCurrentProjectId(id);
    setHistory(loadHistory(id));

    setProjectFormOpen(false);
    setPfName("");
    setPfDescription("");
  }

  function applyRecipe(kind: "powerup" | "coin") {
    if (kind === "powerup") {
      const part = recipePartName || "PowerUpPart";
      const amount = recipeAmount || "10";
      let effectText = "";
      if (recipeEffect === "health") effectText = `increase that player\\'s Humanoid health by ${amount}`;
      else if (recipeEffect === "speed") effectText = `temporarily increase that player\\'s WalkSpeed by ${amount}`;
      else effectText = `temporarily increase that player\\'s JumpPower by ${amount}`;

      const promptText =
        `Create a touch power-up in Roblox Studio.\\n` +
        `There is a Part named ${part} in Workspace. When a player touches it, ${effectText}.\\n` +
        `Make the script as small as possible and assume the Script is inside the ${part} part.`;
      setPrompt(promptText);
      setActiveRecipe(null);
    } else {
      const name = recipeCoinName || "Coin";
      const points = recipeCoinPoints || "1";
      const promptText =
        `Create a minimal Roblox Lua script for a coin pickup.\\n` +
        `There is a Part named ${name} in Workspace. When a player touches it, give that player +${points} Points in leaderstats and optionally destroy the coin.\\n` +
        `Assume the Script is inside the ${name} part. Do not add extra features.`;
      setPrompt(promptText);
      setActiveRecipe(null);
    }

    setFiles([]);
    setError("");
    if (promptRef.current) promptRef.current.focus();
  }

  if (!authLoaded) {
    return (
      <div>
        <TopNav showLinks={false} brandHref={null} />
        <div className="text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!authToken) {
    return (
      <div>
        <TopNav showLinks={false} brandHref={null} />
        <div className="mt-4">
          {authEmail ? (
            <div className="w-full flex flex-col items-center">
              <div className="mt-1 break-all text-xs font-semibold text-slate-400">{authEmail}</div>
              <button
                type="button"
                onClick={logout}
                className="mt-3 w-full max-w-[360px] rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/40 bg-slate-950/90 p-5">
            <div className="text-base font-extrabold">Sign in to VibeCoder</div>
            <div className="mt-1 text-sm font-semibold text-slate-400">Unlock the builder by logging in with your email.</div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={
                  authMode === "login"
                    ? "flex-1 rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                    : "flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
                }
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={
                  authMode === "signup"
                    ? "flex-1 rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                    : "flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
                }
              >
                Sign up
              </button>
            </div>

            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void doAuth(authMode);
              }}
            >
              <div>
                <label className="text-sm font-bold text-slate-200">Email</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={authInputEmail}
                  onChange={(e) => setAuthInputEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-200">Password</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                  type="password"
                  autoComplete="current-password"
                  placeholder="At least 6 characters"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              {authError ? (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">
                  {authError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={authBusy || !authInputEmail.trim() || !authPassword.trim()}
                className="w-full rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-extrabold text-cyan-100 ring-1 ring-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {authBusy ? "Working..." : authMode === "signup" ? "Create account" : "Continue"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopNav showLinks={false} />

      {authEmail ? (
        <div className="mt-4 w-full flex flex-col items-center">
          <div className="mt-1 break-all text-xs font-semibold text-slate-400">{authEmail}</div>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full max-w-[360px] rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
          >
            Logout
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-2xl border border-slate-700/40 bg-slate-950/30 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold">Project</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">Local-only demo projects</div>
            </div>
            <button
              type="button"
              onClick={() => setProjectFormOpen(true)}
              className="rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
            >
              New
            </button>
          </div>

          <div className="mt-3">
            <select
              className="w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
              value={currentProjectId}
              onChange={(e) => {
                const nextId = e.target.value;
                setCurrentProjectId(nextId);
                localStorage.setItem(CURRENT_PROJECT_KEY, nextId);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {projectFormOpen ? (
            <div className="mt-4 rounded-2xl border border-slate-700/40 bg-slate-950/60 p-3">
              <div className="text-sm font-extrabold">New project</div>
              <input
                className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                placeholder="e.g. Coin Collector MVP"
                value={pfName}
                onChange={(e) => setPfName(e.target.value)}
              />
              <textarea
                className="mt-2 w-full resize-y rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                placeholder="Description (optional)"
                rows={3}
                value={pfDescription}
                onChange={(e) => setPfDescription(e.target.value)}
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setProjectFormOpen(false)}
                  className="flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createProject}
                  className="flex-1 rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                >
                  Create
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <div className="text-sm font-extrabold">Templates</div>
            <div className="mt-2 space-y-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  type="button"
                  onClick={() => applyTemplate(t.prompt)}
                  className="w-full rounded-xl border border-slate-700/40 bg-slate-950/40 p-3 text-left hover:bg-slate-950/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-extrabold">{t.title}</div>
                    <div className="rounded-full border border-indigo-400/30 bg-indigo-400/10 px-2 py-1 text-[10px] font-bold uppercase text-indigo-200">
                      {t.pill}
                    </div>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-300">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="text-sm font-extrabold">Guided recipes</div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setActiveRecipe("powerup")}
                className="flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60"
              >
                Power-up
              </button>
              <button
                type="button"
                onClick={() => setActiveRecipe("coin")}
                className="flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60"
              >
                Coin pickup
              </button>
            </div>

            {activeRecipe === "powerup" ? (
              <div className="mt-3 rounded-2xl border border-slate-700/40 bg-slate-950/60 p-3">
                <div className="text-xs font-bold text-slate-400">Touch power-up</div>
                <div className="mt-2 flex gap-2">
                  <select
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                    value={recipeEffect}
                    onChange={(e) => setRecipeEffect(e.target.value as "health" | "speed" | "jump")}
                  >
                    <option value="health">Increase health</option>
                    <option value="speed">Increase walk speed</option>
                    <option value="jump">Increase jump power</option>
                  </select>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                    type="number"
                    min={1}
                    value={recipeAmount}
                    onChange={(e) => setRecipeAmount(e.target.value)}
                  />
                  <input
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                    value={recipePartName}
                    onChange={(e) => setRecipePartName(e.target.value)}
                    placeholder="Part name"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => applyRecipe("powerup")}
                    className="flex-1 rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                  >
                    Use recipe
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRecipe(null)}
                    className="flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {activeRecipe === "coin" ? (
              <div className="mt-3 rounded-2xl border border-slate-700/40 bg-slate-950/60 p-3">
                <div className="text-xs font-bold text-slate-400">Coin pickup</div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                    type="number"
                    min={1}
                    value={recipeCoinPoints}
                    onChange={(e) => setRecipeCoinPoints(e.target.value)}
                  />
                  <input
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                    value={recipeCoinName}
                    onChange={(e) => setRecipeCoinName(e.target.value)}
                    placeholder="Coin part name"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => applyRecipe("coin")}
                    className="flex-1 rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                  >
                    Use recipe
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRecipe(null)}
                    className="flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="text-sm font-extrabold">Recent prompts</div>
            <div className="mt-2 max-h-[200px] space-y-2 overflow-auto pr-1">
              {history.length === 0 ? (
                <div className="text-xs font-semibold text-slate-500">No history yet. Generate something.</div>
              ) : (
                history.map((h, idx) => (
                  <div key={h.ts} className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-slate-950/40 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => loadHistoryEntry(h)}
                      className="flex-1 truncate text-left text-xs font-semibold text-slate-200 hover:underline"
                      title={h.prompt}
                    >
                      {(h.prompt || "").slice(0, 30) + ((h.prompt || "").length > 30 ? "..." : "")}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-1 text-xs font-bold text-slate-400 hover:bg-slate-900/50"
                      onClick={() => {
                        const updated = removeHistoryIndex(currentProjectId, idx);
                        setHistory(updated);
                      }}
                      aria-label="Remove from history"
                    >
                      x
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="rounded-2xl border border-slate-700/40 bg-slate-950/30 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-extrabold">Code Generation</h1>
              <div className="mt-1 text-sm text-slate-300">Describe a mechanic and generate minimal Studio-ready Lua.</div>
            </div>
            <div className="mt-1 rounded-full px-3 py-2 text-xs font-extrabold ring-1 ring-slate-700/60">
              <span
                className={
                  safety.tone === "good"
                    ? "text-emerald-200"
                    : "text-amber-200"
                }
              >
                {safety.label}
              </span>
            </div>
          </div>

          {placementSummary ? <div className="mt-2 text-sm font-semibold text-slate-300">{placementSummary}</div> : null}

          <div className="mt-4">
            <label className="text-sm font-bold text-slate-200">Prompt</label>
            <textarea
              ref={promptRef}
              className="mt-2 w-full resize-y rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/60"
              rows={7}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Create a door that opens when the player touches it"
            />
          </div>

          <div className="mt-4">
            <label className="text-sm font-bold text-slate-200">Images (optional)</label>
            <input
              className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800/70 file:px-3 file:py-2 file:text-sm file:font-bold file:text-slate-100 hover:file:bg-slate-800"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 2))}
            />
            <div className="mt-1 text-xs font-semibold text-slate-400">Up to 2 images (max 4 MB each).</div>
            {files.length ? (
              <div className="mt-2 text-xs font-semibold text-slate-400">
                Selected: {files.map((f) => f.name).slice(0, 2).join(", ")}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onGenerate}
              className="rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-extrabold text-cyan-100 ring-1 ring-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Generating..." : "Generate Code"}
            </button>
            <button
              type="button"
              disabled={loading || !lua.trim()}
              onClick={onRefine}
              className="rounded-xl bg-emerald-500/20 px-4 py-2 text-sm font-extrabold text-emerald-100 ring-1 ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Please wait..." : "Refine Existing Game"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPrompt("");
                setFiles([]);
                setLua("");
                setDescription("");
                setSetupSteps(null);
                setChangeSummary(null);
                setError("");
                setPlacementSummary("");
              }}
              className="rounded-xl bg-slate-900/50 px-4 py-2 text-sm font-extrabold text-slate-200 ring-1 ring-slate-700/60"
            >
              Reset
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-5 rounded-2xl border border-slate-700/40 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold">Generated Lua</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCopy}
                  className="rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  className="rounded-xl bg-indigo-500/20 px-3 py-2 text-xs font-extrabold text-indigo-100 ring-1 ring-indigo-400/40"
                >
                  Download .lua
                </button>
              </div>
            </div>

            {description ? (
              <div className="mt-3 rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-3 text-sm font-semibold text-slate-200 whitespace-pre-wrap">
                {description}
              </div>
            ) : null}

            {setupSteps && setupSteps.length ? (
              <div className="mt-3 rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-3 text-sm font-semibold text-slate-200">
                <div className="mb-2 text-xs font-extrabold text-slate-300">Setup steps</div>
                <ul className="list-disc pl-5 text-sm font-semibold text-slate-200">
                  {setupSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {changeSummary && changeSummary.length ? (
              <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                <div className="mb-2 text-xs font-extrabold text-emerald-200">What changed</div>
                <ul className="list-disc pl-5 text-sm font-semibold">
                  {changeSummary.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 rounded-xl border border-slate-700/40 bg-slate-950/60">
              <pre className="max-h-[520px] overflow-auto p-4 text-xs text-slate-100">
                <code>{lua || "-- Generated Lua will appear here."}</code>
              </pre>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

