"use client";

import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { brandSubtitle, brandTitleGradient, navShell } from "@/lib/brandTheme";

type AppHeaderProps = {
  email: string | null;
  /** When true, show email + Logout inside the logo menu. */
  showAccountActions: boolean;
  onLogout: () => void;
  /** Opens optional sign-in (builder is usable without auth). */
  onSignInClick?: () => void;
};

export function AppHeader({ email, showAccountActions, onLogout, onSignInClick }: AppHeaderProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!detailsOpen) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDetailsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [detailsOpen]);

  return (
    <header className={`relative z-[100] ${navShell} mb-6 pb-4 sm:mb-8`}>
      <div ref={rootRef} className="relative inline-block min-w-0 max-w-full">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex max-w-full items-center gap-3 rounded-xl text-left outline-none ring-offset-2 ring-offset-slate-950 transition hover:bg-slate-900/50 focus-visible:ring-2 focus-visible:ring-cyan-400/45"
          aria-expanded={detailsOpen}
          aria-haspopup="dialog"
        >
          <BrandLogo />
          <div className="min-w-0">
            <div className={`text-base font-extrabold tracking-tight sm:text-lg ${brandTitleGradient}`}>VibeCoder</div>
            <div className={brandSubtitle}>Roblox AI Builder</div>
          </div>
        </button>

        {detailsOpen ? (
          <div
            className="absolute left-0 top-full z-[110] mt-2 w-[min(100vw-2rem,320px)] rounded-2xl border border-slate-700/50 bg-slate-950/95 p-4 shadow-xl backdrop-blur"
            role="dialog"
            aria-label="Account"
          >
            <div className="text-sm font-extrabold text-slate-100">Account</div>

            {showAccountActions ? (
              <>
                <div className="mt-3 max-w-full break-all text-xs font-semibold text-slate-400">
                  {email || "Signed in"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDetailsOpen(false);
                    onLogout();
                  }}
                  className="mt-3 w-full rounded-xl bg-slate-900/50 px-3 py-2 text-xs font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="mt-2 space-y-3">
                <p className="text-xs font-semibold leading-relaxed text-slate-400">
                  You’re not signed in. The builder works without an account — sign in if you want an account on this device.
                </p>
                {onSignInClick ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailsOpen(false);
                      onSignInClick();
                    }}
                    className="w-full rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-extrabold text-cyan-100 ring-1 ring-cyan-400/40 hover:bg-cyan-400/25"
                  >
                    Sign in
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
