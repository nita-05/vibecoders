import { apiBase } from "@/lib/api";

const SYNC_KEY_PREFIX = "vibecoder-studio-sync-key:";
const SYNC_ENABLED_LS = "vibecoder-studio-sync-enabled";

function storageKeyForProject(projectId: string): string {
  const pid = (projectId || "default").trim() || "default";
  return SYNC_KEY_PREFIX + pid;
}

/** One sync key per local project so Studio can follow different places per game. */
export function getOrCreateStudioSyncKey(projectId: string): string {
  if (typeof window === "undefined") return "";
  const lsKey = storageKeyForProject(projectId);
  let k = localStorage.getItem(lsKey);
  if (!k) {
    const legacyGlobal = localStorage.getItem("vibecoder-studio-sync-key");
    if (legacyGlobal && (projectId || "default") === "default") {
      k = legacyGlobal;
      localStorage.setItem(lsKey, k);
      localStorage.removeItem("vibecoder-studio-sync-key");
    } else {
      k = crypto.randomUUID();
      localStorage.setItem(lsKey, k);
    }
  }
  return k;
}

export function getStudioSyncEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(SYNC_ENABLED_LS);
  if (v === null) return true;
  return v === "1" || v === "true";
}

export function setStudioSyncEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SYNC_ENABLED_LS, on ? "1" : "0");
}

/** Push latest Lua to the API so the Roblox Studio sync plugin can poll `/sync/latest`. */
export async function pushCombinedLuaToStudio(
  lua: string,
  projectId: string,
  baseUrl?: string
): Promise<void> {
  const trimmed = (lua || "").trim();
  if (!trimmed) return;

  const root = (baseUrl || apiBase()).replace(/\/+$/, "");
  const sync_key = getOrCreateStudioSyncKey(projectId);

  const res = await fetch(`${root}/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sync_key, combined_lua: trimmed }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Studio sync push failed (${res.status})`);
  }
}
