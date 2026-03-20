import { TopNav } from "@/components/TopNav";

export default function PricingPage() {
  return (
    <div>
      <TopNav />
      <div className="rounded-2xl border border-slate-700/40 bg-slate-950/30 p-7">
        <h1 className="text-2xl font-extrabold tracking-tight">Pricing</h1>
        <p className="mt-2 text-slate-300">Start free. Upgrade when you need more generations and image support.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-700/40 bg-slate-950/40 p-5">
            <div className="text-lg font-extrabold">Free</div>
            <div className="mt-1 text-sm text-slate-300">Great for testing and learning.</div>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>- Limited generations</li>
              <li>- Templates + recipes</li>
              <li>- Local history</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-cyan-400/35 bg-cyan-400/10 p-5">
            <div className="text-lg font-extrabold text-cyan-100">Pro (soon)</div>
            <div className="mt-1 text-sm text-slate-200/90">More usage, projects, and images.</div>
            <ul className="mt-4 space-y-2 text-sm text-slate-200/90">
              <li>- Higher limits</li>
              <li>- Saved generations per project</li>
              <li>- Image generation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

