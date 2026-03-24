import type { Route } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/BrandLogo";
import { brandSubtitle, brandTitleGradient, navInner, navLinkBase, navLinkCta, navShell } from "@/lib/brandTheme";

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
            <BrandLogo />
            <div className="min-w-0">
              <div className={`text-base font-extrabold tracking-tight sm:text-lg ${brandTitleGradient}`}>VibeCoder</div>
              <div className={brandSubtitle}>Roblox AI Builder</div>
            </div>
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo />
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
            <Link className={navLinkBase} href="/#product-overview">
              Features
            </Link>
            <Link className={navLinkBase} href="/pricing">
              Pricing
            </Link>
            <Link className={navLinkBase} href={"/app?auth=1" as Route}>
              Sign up
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}

