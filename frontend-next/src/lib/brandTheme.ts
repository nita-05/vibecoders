/** Shared VibeCoder nav / header styling — keep landing + app consistent. */

export const brandTitleGradient =
  "bg-gradient-to-r from-white via-cyan-50 to-indigo-200 bg-clip-text text-transparent";

export const brandSubtitle = "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs sm:tracking-[0.18em]";

/** Sticky bar: works on all breakpoints without fighting parent padding. */
export const navShell =
  "sticky top-0 z-50 w-full rounded-2xl border border-slate-800/55 bg-slate-950/85 px-3 py-3 shadow-sm shadow-black/20 backdrop-blur-xl supports-[backdrop-filter]:bg-slate-950/75 sm:px-4";

export const navInner = "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4";

export const navLinkBase =
  "rounded-full px-2.5 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800/70 hover:text-white sm:px-3 sm:text-sm";

export const navLinkCta =
  "rounded-full border border-cyan-400/45 bg-cyan-400/12 px-2.5 py-2 text-xs font-bold text-cyan-100 shadow-sm shadow-cyan-500/10 ring-1 ring-cyan-400/20 transition hover:bg-cyan-400/20 sm:px-3 sm:text-sm";
