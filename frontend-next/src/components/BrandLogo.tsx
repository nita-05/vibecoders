type BrandLogoProps = {
  size?: "sm" | "md";
  className?: string;
};

export function BrandLogo({ size = "sm", className = "" }: BrandLogoProps) {
  const dim = size === "md" ? "h-10 w-10" : "h-9 w-9";

  return (
    <div
      className={`${dim} shrink-0 rounded-xl ring-1 ring-white/10 shadow-[0_0_28px_rgba(99,102,241,0.45)] ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 44 44" className="h-full w-full rounded-xl">
        <defs>
          <linearGradient id="vb-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d946ef" />
            <stop offset="52%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="vb-v" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#dbeafe" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="44" height="44" rx="11" fill="url(#vb-bg)" />
        <path
          d="M11.5 11.5l7.5 21h6l7.5-21h-4.9l-5.6 16.2L16.4 11.5h-4.9z"
          fill="url(#vb-v)"
          fillOpacity="0.95"
        />
      </svg>
    </div>
  );
}
