import { TopNav } from "@/components/TopNav";

export default function PricingPage() {
  return (
    <div>
      <TopNav />
      <div className="rounded-2xl border border-slate-700/40 bg-slate-950/40 p-4 sm:p-7">
        <h1 className="text-2xl font-extrabold tracking-tight">Pricing</h1>
        <p className="mt-2 text-slate-300">
          This deployment is built as a working product demo. Usage limits depend on how you host the API and which AI
          provider you configure—not on a separate billing product here.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-700/40 bg-slate-950/40 p-5">
            <div className="text-lg font-extrabold">Current build</div>
            <div className="mt-1 text-sm text-slate-300">
              Full builder: prompts, templates, optional images, sign-in, server-backed projects when Mongo + API are
              configured.
            </div>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>- Rate limits follow your backend / provider (see API env)</li>
              <li>- Templates and recipes included in the UI</li>
              <li>- History per project in the app; plugin sync is optional</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-cyan-400/35 bg-cyan-400/10 p-5">
            <div className="text-lg font-extrabold text-cyan-100">Commercial tiers</div>
            <div className="mt-1 text-sm text-slate-200/90">
              Not defined in this codebase. If you productize VibeCoder, set pricing and limits in your own billing and
              API gateway.
            </div>
            <ul className="mt-4 space-y-2 text-sm text-slate-200/90">
              <li>- Typical next steps: usage metering, team accounts, higher AI quotas</li>
              <li>- Keep reviewing generated Lua before live games</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

