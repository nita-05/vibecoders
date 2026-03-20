export type ApiError = { detail?: string } | null;

export function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
  return base.replace(/\/+$/, "");
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { token?: string }
): Promise<{ ok: true; data: T } | { ok: false; status: number; errorText: string; errorJson: ApiError }> {
  const url = apiBase() + path;
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
  if (init?.token) headers.set("Authorization", "Bearer " + init.token);

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  const json = (() => {
    try {
      return text ? (JSON.parse(text) as ApiError) : null;
    } catch {
      return null;
    }
  })();
  if (!res.ok) {
    return { ok: false, status: res.status, errorText: text, errorJson: json };
  }
  const data = (json ?? (text ? (JSON.parse(text) as T) : (null as unknown as T))) as T;
  return { ok: true, data };
}

