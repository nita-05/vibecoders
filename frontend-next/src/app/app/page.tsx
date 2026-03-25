"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BrandLogo } from "@/components/BrandLogo";
import { apiBase, apiFetch } from "@/lib/api";
import {
  getOrCreateStudioSyncKey,
  getStudioSyncEnabled,
  pushCombinedLuaToStudio,
  setStudioSyncEnabled
} from "@/lib/studioSync";

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
type SidebarView = "builder" | "profile" | "projects";

const PROJECTS_KEY = "vb-local-projects";
const CURRENT_PROJECT_KEY = "vb-local-current-project";
const HISTORY_KEY_BASE = "vibe-coding-history";
const MAX_HISTORY = 10;
const LANDING_PROMPT_DRAFT_KEY = "vb-landing-prompt-draft";

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

const LUA_KEYWORDS = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

function highlightLuaLine(line: string, lineIdx: number): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let part = 0;

  while (i < line.length) {
    // Lua single-line comment.
    if (line[i] === "-" && line[i + 1] === "-") {
      out.push(
        <span key={`l${lineIdx}-p${part++}`} className="text-emerald-300/85">
          {line.slice(i)}
        </span>
      );
      break;
    }

    // Strings: "..." or '...'
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "\\") {
          j += 2;
          continue;
        }
        if (line[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      out.push(
        <span key={`l${lineIdx}-p${part++}`} className="text-amber-300">
          {line.slice(i, j)}
        </span>
      );
      i = j;
      continue;
    }

    // Identifiers / keywords.
    if (/[A-Za-z_]/.test(line[i])) {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j += 1;
      const token = line.slice(i, j);
      out.push(
        <span
          key={`l${lineIdx}-p${part++}`}
          className={LUA_KEYWORDS.has(token) ? "text-sky-300 font-semibold" : "text-cyan-100"}
        >
          {token}
        </span>
      );
      i = j;
      continue;
    }

    // Numbers.
    if (/[0-9]/.test(line[i])) {
      let j = i + 1;
      while (j < line.length && /[0-9._]/.test(line[j])) j += 1;
      out.push(
        <span key={`l${lineIdx}-p${part++}`} className="text-fuchsia-300">
          {line.slice(i, j)}
        </span>
      );
      i = j;
      continue;
    }

    // Everything else (operators, punctuation, spaces).
    out.push(
      <span key={`l${lineIdx}-p${part++}`} className="text-cyan-100">
        {line[i]}
      </span>
    );
    i += 1;
  }

  return out;
}

function highlightLuaCode(luaText: string): ReactNode {
  const lines = luaText.split("\n");
  return (
    <span className="block">
      {lines.map((line, idx) => (
        <span key={`line-${idx}`} className="grid grid-cols-[3.25rem_1fr] gap-3">
          <span className="select-none pr-2 text-right text-xs font-semibold text-slate-500/90">
            {idx + 1}
          </span>
          <span>{highlightLuaLine(line, idx)}</span>
        </span>
      ))}
    </span>
  );
}

function AppBuilderPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** Set only from TopNav “Open app” (`/app?gate=1`). Other links use `/app` and skip this gate. */
  const signInFromNav = searchParams.get("gate") === "1";
  const openAuthFromQuery = searchParams.get("auth") === "1";
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const AUTH_KEY = "vibecoder-auth-token";
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authPanel, setAuthPanel] = useState<"login" | "signup" | "forgot">("login");
  const [authInputEmail, setAuthInputEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string>("");
  const [forgotMessage, setForgotMessage] = useState<string>("");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const logoutRequestedRef = useRef(false);
  const recentPromptsLoadedRef = useRef(false);

  useEffect(() => {
    async function loadAndVerify() {
      try {
        if (logoutRequestedRef.current) return;
        const token = localStorage.getItem(AUTH_KEY);
        const candidate = token ? String(token) : null;
        if (!candidate) {
          setAuthToken(null);
          setAuthEmail(null);
          recentPromptsLoadedRef.current = false;
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
        recentPromptsLoadedRef.current = false;
        setAuthToken(candidate);
      } catch {
        if (logoutRequestedRef.current) return;
        setAuthToken(null);
        setAuthEmail(null);
        recentPromptsLoadedRef.current = false;
      } finally {
        if (!logoutRequestedRef.current) setAuthLoaded(true);
      }
    }

    void loadAndVerify();
  }, []);

  useEffect(() => {
    if (!authLoaded || !signInFromNav) return;
    if (authToken) {
      router.replace("/app");
    }
  }, [authLoaded, signInFromNav, authToken, router]);

  useEffect(() => {
    if (!authLoaded || authToken || !openAuthFromQuery) return;
    setAuthPanel("login");
    setAuthError("");
    setForgotMessage("");
    setAuthModalOpen(true);
  }, [authLoaded, authToken, openAuthFromQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#generate-idea") return;
    const t = setTimeout(() => {
      promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      promptRef.current?.focus();
    }, 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = window.localStorage.getItem(LANDING_PROMPT_DRAFT_KEY);
    if (!draft || !draft.trim()) return;
    setPrompt(draft);
    window.localStorage.removeItem(LANDING_PROMPT_DRAFT_KEY);
  }, []);

  function formatApiDetail(data: unknown): string {
    const d = data as { detail?: unknown };
    if (typeof d.detail === "string") return d.detail;
    if (Array.isArray(d.detail) && d.detail.length) {
      const first = d.detail[0] as { msg?: string };
      if (first && typeof first.msg === "string") return first.msg;
    }
    return "Request failed.";
  }

  async function doForgotPassword() {
    setAuthError("");
    setForgotMessage("");
    const email = (authInputEmail || "").trim();
    if (!email) {
      setAuthError("Enter your email.");
      return;
    }

    setAuthBusy(true);
    try {
      const res = await fetch(apiBase() + "/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(formatApiDetail(data));
      }
      const msg = (data as { message?: string }).message;
      setForgotMessage(
        msg ||
          "Request received. If this email is already registered, check your inbox/spam. If you never signed up, use the Sign up tab first."
      );
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function doAuth(mode: "login" | "signup") {
    setAuthError("");
    setForgotMessage("");
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

      const data = await res.json().catch(
        () => ({} as { detail?: string; access_token?: string; email?: string; recent_prompts?: string[] })
      );
      if (!res.ok) {
        if (res.status === 409 && mode === "signup") {
          setAuthError(
            "This email is already registered. Use the Sign in tab with your existing password (do not create another account)."
          );
          return;
        }
        if (res.status === 401 && mode === "login") {
          setAuthError(
            "Invalid email or password. If you forgot your password, use Forgot password below."
          );
          return;
        }
        throw new Error(formatApiDetail(data));
      }
      const token = data?.access_token;
      if (!token) throw new Error("No access token returned.");

      localStorage.setItem(AUTH_KEY, token);
      setAuthToken(token);
      setAuthEmail(data?.email ? String(data.email) : null);
      if (Array.isArray(data?.recent_prompts)) {
        const cleaned = data.recent_prompts.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
        setAccountRecentPrompts(cleaned);
        recentPromptsLoadedRef.current = true;
      } else {
        recentPromptsLoadedRef.current = false;
      }
      setAuthModalOpen(false);
      if (signInFromNav) {
        router.replace("/app");
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
    setAuthEmail(null);
    setAccountRecentPrompts([]);
    recentPromptsLoadedRef.current = false;
    setAuthError("");
    setForgotMessage("");
    setAuthPanel("login");
    router.push("/");
  }

  function openSignInModal() {
    setAuthPanel("login");
    setAuthError("");
    setForgotMessage("");
    setAuthModalOpen(true);
  }

  function startNewChat() {
    setPrompt("");
    setFiles([]);
    setLua("");
    setDescription("");
    setSetupSteps(null);
    setChangeSummary(null);
    setError("");
    setPlacementSummary("");
    setSidebarView("builder");
  }

  async function loadAccountRecentPrompts(token: string) {
    try {
      const res = await apiFetch<{ items?: string[] }>("/auth/recent-prompts", { method: "GET", token });
      if (!res.ok) return;
      const items = Array.isArray(res.data.items) ? res.data.items : [];
      setAccountRecentPrompts(items.filter((x) => typeof x === "string" && x.trim()));
      recentPromptsLoadedRef.current = true;
    } catch {
      // ignore
    }
  }

  async function saveRecentPromptForAccount(promptText: string) {
    const token = authToken ?? (typeof window !== "undefined" ? localStorage.getItem(AUTH_KEY) : null);
    if (!token) return;
    const text = (promptText || "").trim();
    if (!text) return;
    try {
      const res = await apiFetch<{ items?: string[] }>("/auth/recent-prompts", {
        method: "POST",
        token,
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok) return;
      const items = Array.isArray(res.data.items) ? res.data.items : [];
      setAccountRecentPrompts(items.filter((x) => typeof x === "string" && x.trim()));
    } catch {
      // ignore
    }
  }

  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>("default");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const actionInFlightRef = useRef<"none" | "generate" | "refine">("none");
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

  const [studioSyncEnabled, setStudioSyncEnabledState] = useState(true);
  const [studioSyncKey, setStudioSyncKey] = useState("");
  const [studioSyncHint, setStudioSyncHint] = useState<string | null>(null);
  const [studioSyncCopied, setStudioSyncCopied] = useState(false);
  const [studioTokenCopied, setStudioTokenCopied] = useState(false);

  const [activeRecipe, setActiveRecipe] = useState<"powerup" | "coin" | null>(null);
  const [recipeEffect, setRecipeEffect] = useState<"health" | "speed" | "jump">("health");
  const [recipeAmount, setRecipeAmount] = useState<string>("10");
  const [recipePartName, setRecipePartName] = useState<string>("PowerUpPart");
  const [recipeCoinPoints, setRecipeCoinPoints] = useState<string>("1");
  const [recipeCoinName, setRecipeCoinName] = useState<string>("Coin");
  const [sidebarView, setSidebarView] = useState<SidebarView>("builder");
  const [accountRecentPrompts, setAccountRecentPrompts] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setStudioSyncEnabledState(getStudioSyncEnabled());
  }, []);

  useEffect(() => {
    if (!currentProjectId) return;
    setStudioSyncKey(getOrCreateStudioSyncKey(currentProjectId));
  }, [currentProjectId]);

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

  useEffect(() => {
    if (!authToken) {
      setAccountRecentPrompts([]);
      recentPromptsLoadedRef.current = false;
      return;
    }
    if (recentPromptsLoadedRef.current) return;
    void loadAccountRecentPrompts(authToken);
  }, [authToken]);

  const currentProjectName = useMemo(() => {
    const p = projects.find((x) => x.id === currentProjectId);
    return p?.name || "Default";
  }, [projects, currentProjectId]);

  const busy = generating || refining;
  const canSubmit = useMemo(() => prompt.trim().length > 0 && !busy, [prompt, busy]);
  const highlightedLua = useMemo(() => (lua.trim() ? highlightLuaCode(lua) : null), [lua]);
  const sidebarRecentPrompts = useMemo(() => {
    const seen = new Set<string>();
    const localPrompts = history
      .map((h) => (h.prompt || "").trim())
      .filter((x) => x.length > 0)
      .filter((x) => {
        if (seen.has(x)) return false;
        seen.add(x);
        return true;
      });

    if (!authToken) return localPrompts.slice(0, 10);

    // Signed-in users can still generate locally; merge account + local so sidebar never looks empty.
    const accountPrompts = accountRecentPrompts
      .map((x) => (x || "").trim())
      .filter((x) => x.length > 0)
      .filter((x) => {
        if (seen.has(x)) return false;
        seen.add(x);
        return true;
      });

    return [...accountPrompts, ...localPrompts].slice(0, 10);
  }, [authToken, accountRecentPrompts, history]);

  function toggleStudioSync(on: boolean) {
    setStudioSyncEnabledState(on);
    setStudioSyncEnabled(on);
  }

  async function copyStudioSyncKey() {
    if (!studioSyncKey) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(studioSyncKey);
      } else {
        const ok = fallbackCopyText(studioSyncKey);
        if (!ok) return;
      }
      setStudioSyncCopied(true);
      setTimeout(() => setStudioSyncCopied(false), 1500);
    } catch {
      const ok = fallbackCopyText(studioSyncKey);
      if (!ok) return;
      setStudioSyncCopied(true);
      setTimeout(() => setStudioSyncCopied(false), 1500);
    }
  }

  async function copyAccessTokenForStudio() {
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_KEY) : null;
    if (!token) {
      setStudioSyncHint("Sign in to copy your access token for the Studio plugin.");
      setTimeout(() => setStudioSyncHint(null), 4500);
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(token);
      } else {
        const ok = fallbackCopyText(token);
        if (!ok) return;
      }
      setStudioTokenCopied(true);
      setTimeout(() => setStudioTokenCopied(false), 1500);
    } catch {
      const ok = fallbackCopyText(token);
      if (!ok) return;
      setStudioTokenCopied(true);
      setTimeout(() => setStudioTokenCopied(false), 1500);
    }
  }

  async function tryPushStudio(lua: string) {
    if (!studioSyncEnabled) return;
    const t = (lua || "").trim();
    if (!t) return;
    const token = authToken ?? (typeof window !== "undefined" ? localStorage.getItem(AUTH_KEY) : null);
    if (!token) {
      setStudioSyncHint("Sign in to push generated code to Studio sync.");
      setTimeout(() => setStudioSyncHint(null), 4500);
      return;
    }
    try {
      await pushCombinedLuaToStudio(t, currentProjectId, apiBase(), token);
      setStudioSyncHint("Pushed to Studio sync.");
      setTimeout(() => setStudioSyncHint(null), 3500);
    } catch (e) {
      console.warn(e);
      const msg = e instanceof Error ? e.message : "Studio sync push failed";
      setStudioSyncHint(msg);
    }
  }

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
    if (actionInFlightRef.current !== "none") return;
    setError("");
    actionInFlightRef.current = "generate";
    setGenerating(true);
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
        void saveRecentPromptForAccount(prompt);
        void tryPushStudio(finalLua);
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
        void saveRecentPromptForAccount(prompt);
        void tryPushStudio(outLua);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setGenerating(false);
      actionInFlightRef.current = "none";
    }
  }

  async function onRefine() {
    if (actionInFlightRef.current !== "none") return;
    if (!lua.trim()) {
      setError("Generate code first, then ask for improvements in Prompt and click Refine Existing Game.");
      return;
    }
    if (!prompt.trim()) {
      setError("Enter improvement request in Prompt before refining.");
      return;
    }

    setError("");
    actionInFlightRef.current = "refine";
    setRefining(true);
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
      void saveRecentPromptForAccount(prompt);
      void tryPushStudio(finalLua);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRefining(false);
      actionInFlightRef.current = "none";
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

  function deleteProject(projectId: string) {
    const targetId = (projectId || "").trim();
    if (!targetId) return;

    const remaining = projects.filter((p) => p.id !== targetId);
    const nextProjects = remaining.length ? remaining : [{ id: "default", name: "Default", description: "" }];

    saveLocalProjects(nextProjects);
    setProjects(nextProjects);

    if (currentProjectId === targetId) {
      const fallbackId = nextProjects[0].id;
      setCurrentProjectId(fallbackId);
      localStorage.setItem(CURRENT_PROJECT_KEY, fallbackId);
      setHistory(loadHistory(fallbackId));
    }
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
        <div className="text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  /* TopNav “Open app” only: require sign-in before builder (previous behavior). */
  if (signInFromNav && !authToken) {
    return (
      <div>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/40 bg-slate-950/90 p-5 shadow-2xl">
            <div className="text-base font-extrabold">Sign in to VibeCoder</div>
            <div className="mt-1 text-sm font-semibold text-slate-400">Unlock the builder by logging in with your email.</div>

            <div className="mt-4 flex gap-2">
              {authPanel === "forgot" ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthPanel("login");
                    setAuthError("");
                    setForgotMessage("");
                  }}
                  className="w-full rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
                >
                  ← Back to sign in
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthPanel("login");
                      setAuthError("");
                      setForgotMessage("");
                    }}
                    className={
                      authPanel === "login"
                        ? "flex-1 rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                        : "flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
                    }
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthPanel("signup");
                      setAuthError("");
                      setForgotMessage("");
                    }}
                    className={
                      authPanel === "signup"
                        ? "flex-1 rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                        : "flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
                    }
                  >
                    Sign up
                  </button>
                </>
              )}
            </div>

            {authPanel === "forgot" ? (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doForgotPassword();
                }}
              >
                <div className="rounded-xl border border-slate-600/50 bg-slate-900/60 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-400">
                  <span className="text-slate-200">Note:</span> A reset email is only sent if this address
                  already has an account. New users: go back and use{" "}
                  <button
                    type="button"
                    className="font-extrabold text-cyan-300 underline decoration-cyan-500/50"
                    onClick={() => {
                      setAuthPanel("signup");
                      setForgotMessage("");
                      setAuthError("");
                    }}
                  >
                    Sign up
                  </button>{" "}
                  first.
                </div>
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
                {forgotMessage ? (
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100">
                    {forgotMessage}
                  </div>
                ) : null}
                {authError ? (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">
                    {authError}
                  </div>
                ) : null}
                <button
                  type="submit"
                  disabled={authBusy || !authInputEmail.trim()}
                  className="w-full rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-extrabold text-cyan-100 ring-1 ring-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {authBusy ? "Working..." : "Send reset link"}
                </button>
              </form>
            ) : (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doAuth(authPanel);
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
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-bold text-slate-200">Password</label>
                    {authPanel === "login" ? (
                      <button
                        type="button"
                        className="text-xs font-bold text-cyan-300/90 hover:underline"
                        onClick={() => {
                          setAuthPanel("forgot");
                          setAuthError("");
                          setForgotMessage("");
                        }}
                      >
                        Forgot password?
                      </button>
                    ) : null}
                  </div>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                    type="password"
                    autoComplete={authPanel === "signup" ? "new-password" : "current-password"}
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
                  {authBusy ? "Working..." : authPanel === "signup" ? "Create account" : "Continue"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="rounded-xl bg-slate-900/60 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/80"
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <span className="text-sm leading-none">☰</span>
        </button>
      </div>
      <div className={sidebarOpen ? "grid gap-5 lg:grid-cols-[240px_1fr]" : "grid gap-5"}>
        {sidebarOpen ? (
        <aside className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col rounded-2xl border border-slate-700/40 bg-slate-950/60 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <BrandLogo size="md" />
            <div className="min-w-0">
              <div className="bg-gradient-to-r from-white via-cyan-50 to-indigo-200 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
                VibeCoder
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Roblox AI Builder</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="px-3 text-xs font-extrabold uppercase tracking-wide text-slate-500">Recent prompts</div>
            <div className="mt-2 max-h-[220px] space-y-1.5 overflow-auto pr-1">
              {sidebarRecentPrompts.length === 0 ? (
                <div className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500">
                  No recent prompts yet.
                </div>
              ) : (
                sidebarRecentPrompts.map((item, idx) => (
                  <button
                    key={`${idx}-${item.slice(0, 20)}`}
                    type="button"
                    onClick={() => {
                      const match = history.find((h) => (h.prompt || "").trim() === item.trim());
                      if (match) {
                        loadHistoryEntry(match);
                      } else {
                        setPrompt(item);
                      }
                      setSidebarView("builder");
                      setError("");
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-300/90 hover:bg-slate-900/40"
                    title={item}
                  >
                    {item.length > 48 ? `${item.slice(0, 48)}...` : item}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="mt-3 h-px bg-slate-800/70" />

          <div className="mt-3 space-y-1.5">
            <button
              type="button"
              onClick={startNewChat}
              className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-300 hover:bg-slate-900/60"
            >
              New chat
            </button>
            <button
              type="button"
              onClick={() => setSidebarView("projects")}
              className={
                sidebarView === "projects"
                  ? "w-full rounded-xl bg-cyan-400/15 px-3 py-2 text-left text-sm font-bold text-cyan-100 ring-1 ring-cyan-400/35"
                  : "w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-300 hover:bg-slate-900/60"
              }
            >
              Projects
            </button>
            <button
              type="button"
              onClick={() => setSidebarView("profile")}
              className={
                sidebarView === "profile"
                  ? "w-full rounded-xl bg-cyan-400/15 px-3 py-2 text-left text-sm font-bold text-cyan-100 ring-1 ring-cyan-400/35"
                  : "w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-300 hover:bg-slate-900/60"
              }
            >
              Profile
            </button>
          </div>

          <div className="mt-auto space-y-2">
            {!authToken ? (
              <button
                type="button"
                onClick={openSignInModal}
                className="w-full rounded-xl bg-cyan-400/20 px-3 py-2 text-sm font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
              >
                Sign up
              </button>
            ) : null}
            <button
              type="button"
              onClick={logout}
              disabled={!authToken}
              className="w-full rounded-xl bg-slate-900/60 px-3 py-2 text-sm font-extrabold text-slate-200 ring-1 ring-slate-700/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Log out
            </button>
          </div>
        </aside>
        ) : null}

        <div>
          {sidebarView === "profile" ? (
            <section className="rounded-2xl border border-slate-700/40 bg-slate-950/30 p-5">
              <h1 className="text-lg font-extrabold">Profile</h1>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-700/45 bg-slate-950/50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</div>
                  <div className="mt-1 break-all text-sm font-bold text-slate-100">
                    {authEmail || "Not signed in"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-700/45 bg-slate-950/50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</div>
                  <div className="mt-1 text-sm font-bold text-slate-100">{authToken ? "Signed in" : "Guest mode"}</div>
                </div>
                <div className="rounded-xl border border-slate-700/45 bg-slate-950/50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projects</div>
                  <div className="mt-1 text-sm font-bold text-slate-100">{projects.length}</div>
                </div>
                <div className="rounded-xl border border-slate-700/45 bg-slate-950/50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current project</div>
                  <div className="mt-1 text-sm font-bold text-slate-100">{currentProjectName}</div>
                </div>
              </div>
            </section>
          ) : sidebarView === "projects" ? (
            <section className="rounded-2xl border border-slate-700/40 bg-slate-950/30 p-5">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-lg font-extrabold">Projects</h1>
                <button
                  type="button"
                  onClick={() => setProjectFormOpen(true)}
                  className="rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                >
                  New
                </button>
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

              <div className="mt-4 space-y-2">
                {projects.length === 0 ? (
                  <div className="text-sm font-semibold text-slate-500">No projects yet.</div>
                ) : (
                  projects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-extrabold text-slate-100">{p.name}</div>
                        {p.description ? (
                          <div className="truncate text-xs font-semibold text-slate-400">{p.description}</div>
                        ) : null}
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentProjectId(p.id);
                            localStorage.setItem(CURRENT_PROJECT_KEY, p.id);
                            startNewChat();
                          }}
                          className="rounded-lg bg-slate-900/50 px-3 py-1.5 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProject(p.id)}
                          className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-extrabold text-red-200 ring-1 ring-red-400/35 hover:bg-red-500/25"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-slate-700/40 bg-slate-950/30 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold">Project</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">
                Signed in: projects sync to the server. Not signed in: projects stay in this browser only.
              </div>
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

          <div className="mt-5 rounded-2xl border border-cyan-500/25 bg-slate-950/40 p-4">
            <div className="text-sm font-extrabold text-cyan-100">Roblox Studio live sync</div>
            <p className="mt-1 text-xs font-semibold leading-snug text-slate-400">
              When you generate or refine (while signed in), Lua is sent to the API. The sync key is{" "}
              <span className="font-bold text-slate-300">per project</span> — switch the project above to use another key
              in Studio.
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={studioSyncEnabled}
                onChange={(e) => toggleStudioSync(e.target.checked)}
              />
              Push generated code to Studio automatically
            </label>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sync key</div>
            <div className="mt-1 flex gap-2">
              <div className="min-w-0 flex-1 truncate rounded-lg border border-slate-700/50 bg-slate-950/60 px-2 py-1.5 font-mono text-[10px] text-slate-300">
                {studioSyncKey || "—"}
              </div>
              <button
                type="button"
                onClick={() => void copyStudioSyncKey()}
                className="min-w-[4.5rem] shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                {studioSyncCopied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Access token (paste in Studio plugin)
            </div>
            <div className="mt-1 flex gap-2">
              <div className="min-w-0 flex-1 truncate rounded-lg border border-slate-700/50 bg-slate-950/60 px-2 py-1.5 font-mono text-[10px] text-slate-500">
                {authToken ? "•••••••• (hidden)" : "— sign in to obtain"}
              </div>
              <button
                type="button"
                onClick={() => void copyAccessTokenForStudio()}
                className="min-w-[4.5rem] shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                {studioTokenCopied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Plugin API base:{" "}
              <span className="break-all font-mono text-slate-400">{apiBase()}</span>
            </p>
            <a
              href="/roblox-plugin/VibeCoderSync.lua"
              download="VibeCoderSync.lua"
              className="mt-3 inline-flex rounded-xl bg-cyan-400/15 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/35 hover:bg-cyan-400/25"
            >
              Download VibeCoderSync.lua
            </a>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Studio: <span className="font-semibold text-slate-400">Plugins → Create Plugin</span>, paste the script.
              Enable HTTP requests in Studio settings. Paste the same API URL, Sync key, and access token (Copy above),
              then Save settings and Start polling.
            </p>
            {studioSyncHint ? (
              <p className="mt-2 text-xs font-semibold text-slate-400">{studioSyncHint}</p>
            ) : null}
          </div>

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

        </aside>

        <main id="generate-idea" className="rounded-2xl border border-slate-700/40 bg-slate-950/30 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-extrabold">Code Generation</h1>
              <div className="mt-1 text-base text-slate-300">Generate your idea/prompt to code.</div>
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
              {generating ? "Generating..." : "Generate Code"}
            </button>
            <button
              type="button"
              disabled={busy || !lua.trim()}
              onClick={onRefine}
              className="rounded-xl bg-emerald-500/20 px-4 py-2 text-sm font-extrabold text-emerald-100 ring-1 ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refining ? "Please wait..." : "Refine Existing Game"}
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
                <button
                  type="button"
                  onClick={() => {
                    setLua("");
                    setDescription("");
                    setSetupSteps(null);
                    setChangeSummary(null);
                    setPlacementSummary("");
                    setCopied(false);
                    setError("");
                  }}
                  className="rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60"
                >
                  Clear
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

            <div
              className={
                lua.trim()
                  ? "mt-3 rounded-xl border border-cyan-400/35 bg-slate-950/75 ring-1 ring-cyan-500/25 shadow-[0_0_30px_rgba(34,211,238,0.08)]"
                  : "mt-3 rounded-xl border border-slate-700/40 bg-slate-950/60"
              }
            >
              <pre className="max-h-[76vh] min-h-[460px] overflow-auto p-6 text-base leading-relaxed lg:text-lg">
                {lua.trim() ? (
                  <code className="font-mono">{highlightedLua}</code>
                ) : (
                  <code className="font-mono text-slate-300">-- Generated Lua will appear here.</code>
                )}
              </pre>
            </div>
          </div>
        </main>
      </div>
          )}
        </div>
      </div>

      {authModalOpen && !authToken ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          onClick={() => setAuthModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700/40 bg-slate-950/95 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div id="auth-modal-title" className="text-base font-extrabold">
                  Sign in to VibeCoder
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              {authPanel === "forgot" ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthPanel("login");
                    setAuthError("");
                    setForgotMessage("");
                  }}
                  className="w-full rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
                >
                  ← Back to sign in
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthPanel("login");
                      setAuthError("");
                      setForgotMessage("");
                    }}
                    className={
                      authPanel === "login"
                        ? "flex-1 rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                        : "flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
                    }
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthPanel("signup");
                      setAuthError("");
                      setForgotMessage("");
                    }}
                    className={
                      authPanel === "signup"
                        ? "flex-1 rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40"
                        : "flex-1 rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
                    }
                  >
                    Sign up
                  </button>
                </>
              )}
            </div>

            {authPanel === "forgot" ? (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doForgotPassword();
                }}
              >
                <div className="rounded-xl border border-slate-600/50 bg-slate-900/60 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-400">
                  <span className="text-slate-200">Note:</span> A reset email is only sent if this address
                  already has an account. New users: go back and use{" "}
                  <button
                    type="button"
                    className="font-extrabold text-cyan-300 underline decoration-cyan-500/50"
                    onClick={() => {
                      setAuthPanel("signup");
                      setForgotMessage("");
                      setAuthError("");
                    }}
                  >
                    Sign up
                  </button>{" "}
                  first.
                </div>
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
                {forgotMessage ? (
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100">
                    {forgotMessage}
                  </div>
                ) : null}
                {authError ? (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">
                    {authError}
                  </div>
                ) : null}
                <button
                  type="submit"
                  disabled={authBusy || !authInputEmail.trim()}
                  className="w-full rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-extrabold text-cyan-100 ring-1 ring-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {authBusy ? "Working..." : "Send reset link"}
                </button>
              </form>
            ) : (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doAuth(authPanel);
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
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-bold text-slate-200">Password</label>
                    {authPanel === "login" ? (
                      <button
                        type="button"
                        className="text-xs font-bold text-cyan-300/90 hover:underline"
                        onClick={() => {
                          setAuthPanel("forgot");
                          setAuthError("");
                          setForgotMessage("");
                        }}
                      >
                        Forgot password?
                      </button>
                    ) : null}
                  </div>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
                    type="password"
                    autoComplete={authPanel === "signup" ? "new-password" : "current-password"}
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
                  {authBusy ? "Working..." : authPanel === "signup" ? "Create account" : "Continue"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AppBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-slate-400">
          Loading...
        </div>
      }
    >
      <AppBuilderPageContent />
    </Suspense>
  );
}

