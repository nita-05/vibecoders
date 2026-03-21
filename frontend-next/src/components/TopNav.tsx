import type { Route } from "next";
import Link from "next/link";

import { brandSubtitle, brandTitleGradient, navInner, navLinkBase, navLinkCta, navShell } from "@/lib/brandTheme";

function LogoIcon() {
  return (
    <div
      className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-fuchsia-500 via-indigo-500 to-cyan-400 shadow-[0_0_28px_rgba(99,102,241,0.45)] ring-1 ring-white/10"
      aria-hidden
    />
  );
}

export function TopNav({
  showLinks = true,
  brandHref = "/" as Route,
}: {
  showLinks?: boolean;
  // When null, the brand icon/text is not clickable (useful for auth-locked pages).
  brandHref?: Route | null;
}) {
  return (
    <header className={`${navShell} mb-6 sm:mb-8`}>
      <div className={navInner}>
        {brandHref ? (
          <Link
            href={brandHref}
            className="flex min-w-0 max-w-[min(100%,18rem)] items-center gap-3 rounded-xl outline-none ring-offset-2 ring-offset-slate-950 focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          >
            <LogoIcon />
            <div className="min-w-0">
              <div className={`text-base font-extrabold tracking-tight sm:text-lg ${brandTitleGradient}`}>VibeCoder</div>
              <div className={brandSubtitle}>Roblox AI Builder</div>
            </div>
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <LogoIcon />
            <div className="min-w-0">
              <div className={`text-base font-extrabold tracking-tight sm:text-lg ${brandTitleGradient}`}>VibeCoder</div>
              <div className={brandSubtitle}>Roblox AI Builder</div>
            </div>
          </div>
        )}
        {showLinks ? (
          <nav
            className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2"
            aria-label="Main navigation"
          >
            <Link className={navLinkBase} href="/docs">
              Docs
            </Link>
            <Link className={navLinkBase} href="/pricing">
              Pricing
            </Link>
            <Link className={navLinkCta} href={"/app?gate=1" as Route}>
              Open app
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}

