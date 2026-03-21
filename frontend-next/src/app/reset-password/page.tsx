"use client";

import { type FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { apiBase } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!token.trim()) {
      setError("Missing reset token. Open the link from your email again.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(apiBase() + "/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof (data as { detail?: unknown }).detail === "string" ? (data as { detail: string }).detail : "Could not reset password.";
        throw new Error(detail);
      }
      setDone(true);
      setTimeout(() => router.push("/app"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center text-emerald-100">
        <div className="text-lg font-extrabold">Password updated</div>
        <p className="mt-2 text-sm font-semibold text-emerald-200/90">Redirecting to the app…</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-700/40 bg-slate-950/90 p-6 shadow-2xl">
      <div className="text-lg font-extrabold text-slate-100">Set a new password</div>
      <p className="text-sm font-semibold text-slate-400">
        Paste the token from your reset link, or open this page from the email link (token filled automatically).
      </p>
      <div>
        <label className="text-sm font-bold text-slate-200">Reset token</label>
        <input
          className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 font-mono text-xs text-slate-100 outline-none"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="token from URL"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="text-sm font-bold text-slate-200">New password</label>
        <input
          type="password"
          className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 6 characters"
        />
      </div>
      <div>
        <label className="text-sm font-bold text-slate-200">Confirm password</label>
        <input
          type="password"
          className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">{error}</div>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-extrabold text-cyan-100 ring-1 ring-cyan-400/40 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <Suspense fallback={<div className="text-center text-slate-400">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
