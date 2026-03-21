import type { Route } from "next";
import Link from "next/link";

export function TopNav({
  showLinks = true,
  brandHref = "/" as Route,
}: {
  showLinks?: boolean;
  // When null, the brand icon/text is not clickable (useful for auth-locked pages).
  brandHref?: Route | null;
}) {
  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      {brandHref ? (
        <Link href={brandHref} className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-fuchsia-500 via-indigo-500 to-cyan-400 shadow-[0_0_32px_rgba(99,102,241,0.5)]" />
          <div>
            <div className="text-base font-extrabold tracking-tight">VibeCoder</div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Roblox AI Builder</div>
          </div>
        </Link>
      ) : (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-fuchsia-500 via-indigo-500 to-cyan-400 shadow-[0_0_32px_rgba(99,102,241,0.5)]" />
          <div>
            <div className="text-base font-extrabold tracking-tight">VibeCoder</div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Roblox AI Builder</div>
          </div>
        </div>
      )}
      {showLinks ? (
        <nav className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <Link className="rounded-full px-3 py-2 hover:bg-slate-800/60" href="/docs">
            Docs
          </Link>
          <Link className="rounded-full px-3 py-2 hover:bg-slate-800/60" href="/pricing">
            Pricing
          </Link>
          <Link
            className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-cyan-200 hover:bg-cyan-400/20"
            href={"/app?gate=1" as Route}
          >
            Open app
          </Link>
        </nav>
      ) : null}
    </header>
  );
}

