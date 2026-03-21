import Link from "next/link";

import { TopNav } from "@/components/TopNav";

/**
 * Landing layout — one `<section>` per major block; each section uses one inner
 * wrapper `div` for the card/panel so structure stays easy to edit.
 */
export default function HomePage() {
  return (
    <div className="landing-root space-y-10 pb-8 sm:space-y-12 sm:pb-10">
      <TopNav />

      {/* 1) Hero: headline, CTAs, 3 mini-cards, example Lua */}
      <section
        id="hero"
        aria-labelledby="hero-heading"
        className="rounded-2xl border border-slate-700/40 bg-slate-950/40 p-4 shadow-lg shadow-black/20 backdrop-blur-sm sm:rounded-3xl sm:p-6 lg:p-8"
      >
        <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="rounded-full border border-cyan-400/35 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-100 sm:px-3 sm:text-xs">
                Describe → Roblox Lua
              </span>
              <span className="rounded-full border border-slate-700/50 bg-slate-900/40 px-2.5 py-1 text-[11px] font-bold text-slate-200 sm:px-3 sm:text-xs">
                Studio-ready output
              </span>
              <span className="rounded-full border border-indigo-400/35 bg-indigo-400/10 px-2.5 py-1 text-[11px] font-bold text-indigo-100 sm:px-3 sm:text-xs">
                Optional images
              </span>
            </div>

            <h1
              id="hero-heading"
              className="mt-4 text-balance bg-gradient-to-br from-white via-cyan-100 to-indigo-200 bg-clip-text text-3xl font-extrabold leading-tight tracking-tight text-transparent sm:mt-5 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]"
            >
              VibeCoder: from a short description to Roblox Lua you can paste in Studio.
            </h1>

            <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
              You describe the mechanic or game change; the app returns Lua structured with{" "}
              <code className="rounded bg-slate-900/70 px-1.5 py-0.5 text-sm text-cyan-100/90">-- Script: …</code>{" "}
              headers so you know where each piece goes. Add up to two reference images if it helps. Sign in to keep
              projects on your account; the optional Roblox Studio plugin can pull the latest generated code when you
              wire it to the same API and sync key.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:mt-7 sm:flex-row sm:flex-wrap sm:gap-3">
              <Link
                href="/app"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-cyan-400/20 px-4 py-2.5 text-center text-sm font-bold text-cyan-100 ring-1 ring-cyan-400/40 hover:bg-cyan-400/25 sm:min-h-0 sm:py-2"
              >
                Open the builder
              </Link>
              <Link
                href="/docs"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-900/50 px-4 py-2.5 text-center text-sm font-bold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70 sm:min-h-0 sm:py-2"
              >
                See how it works
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                {
                  k: "Clear placement",
                  v: 'Outputs use `-- Script: Service/Path` headers so you can match scripts to places in your place file.'
                },
                {
                  k: "Iterate quickly",
                  v: "Regenerate from a new prompt or refine what you already have—then test in Studio and repeat."
                },
                {
                  k: "Account + plugin (optional)",
                  v: "Sign in to sync projects with the backend. The Studio plugin reads the same API using your token and project sync key."
                }
              ].map((x) => (
                <div key={x.k} className="rounded-2xl border border-slate-700/40 bg-slate-950/40 p-4">
                  <div className="text-sm font-extrabold text-slate-100">{x.k}</div>
                  <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-400">{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="rounded-3xl border border-slate-700/35 bg-slate-950/40 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-extrabold text-slate-200">Example output</div>
                <span className="rounded-full border border-indigo-400/35 bg-indigo-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-100">
                  Copy into Studio
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700/35 bg-slate-950/50">
                <pre className="max-h-[min(320px,50vh)] overflow-auto p-4 text-xs leading-relaxed text-slate-100">
                  <code>
                    {`-- Script: ServerScriptService/GameManager
local Players = game:GetService("Players")

-- Minimal example: award +1 on touch, then respawn
local function givePoint(player)
  local leaderstats = player:FindFirstChild("leaderstats")
  local points = leaderstats and leaderstats:FindFirstChild("Points")
  if points then points.Value += 1 end
end

-- Paste generator output as-is, then iterate.`}
                  </code>
                </pre>
              </div>

              <div className="mt-3 text-xs font-semibold text-slate-400">
                Tip: if you need multiple scripts, output each one with a header like{" "}
                <span className="rounded bg-slate-900/60 px-1 py-0.5 font-bold text-slate-200">
                  -- Script: ServerScriptService/YourModule
                </span>
                .
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2) Product overview: “what it does” + “flow” in ONE panel (two sub-blocks) */}
      <section id="product-overview" aria-labelledby="features-title">
        <div className="rounded-3xl border border-slate-700/40 bg-slate-950/35 p-5 sm:p-7">
          <div className="space-y-10 sm:space-y-12">
            <div>
              <h2
                id="features-title"
                className="text-balance text-xl font-extrabold tracking-tight text-slate-50 sm:text-2xl"
              >
                What this app actually does
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[
                  {
                    title: "Lua shaped for Studio",
                    desc: "Generation is meant to be small and complete enough to paste into Script instances, with paths called out in headers so you’re not guessing."
                  },
                  {
                    title: "Templates and recipes",
                    desc: "Starter prompts and quick recipes load into the builder so you edit details instead of starting from zero."
                  },
                  {
                    title: "Projects and history",
                    desc: "Signed-in users get server-backed projects; history and prompt context stay per project. Without an account, work stays in this browser only."
                  }
                ].map((x) => (
                  <div key={x.title} className="rounded-3xl border border-slate-700/40 bg-slate-950/40 p-5">
                    <div className="text-sm font-extrabold text-slate-100">{x.title}</div>
                    <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-400">{x.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2
                id="how-title"
                className="text-balance text-xl font-extrabold tracking-tight text-slate-50 sm:text-2xl"
              >
                Flow in three steps
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[
                  {
                    n: "1",
                    t: "Describe the behavior",
                    d: "State what should happen in Roblox (touch, UI, NPCs, etc.). Images are optional; up to two if the scene matters."
                  },
                  {
                    n: "2",
                    t: "Generate Lua",
                    d: "The API returns Lua with placement headers. Copy into the right services in Studio."
                  },
                  {
                    n: "3",
                    t: "Test and adjust",
                    d: "Run in Play mode, then change the prompt or use refine to update the script—same loop you’d use in any AI-assisted coding workflow."
                  }
                ].map((x) => (
                  <div key={x.n} className="rounded-3xl border border-slate-700/40 bg-slate-950/40 p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/15 text-sm font-extrabold text-cyan-100 ring-1 ring-cyan-400/30">
                        {x.n}
                      </div>
                      <div className="text-sm font-extrabold text-slate-100">{x.t}</div>
                    </div>
                    <div className="mt-3 text-sm font-semibold leading-relaxed text-slate-400">{x.d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3) Starter prompts */}
      <section id="starter-prompts" aria-labelledby="examples-title">
        <div className="rounded-3xl border border-slate-700/40 bg-slate-950/35 p-5 sm:p-7">
          <h2
            id="examples-title"
            className="text-balance text-xl font-extrabold tracking-tight text-slate-50 sm:text-2xl"
          >
            Try a starter prompt
          </h2>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {[
              {
                title: "Coin collector MVP",
                chip: "templates + recipes",
                prompt: `Build a small complete Roblox coin-collector game (MVP) using Roblox Lua.

Requirements:
- Use leaderstats named Points (default 0).
- Spawn 15 coins around Workspace at random positions.
- Touch coin -> disappear +1 Point, respawn after 5 seconds.
- Add a 60-second timer and show a simple ScreenGui at the end.`
              },
              {
                title: "Escape from zombies",
                chip: "full game",
                prompt: `Build a small complete Roblox "escape from zombies" game (MVP) using Roblox Lua.

Requirements:
- Workspace contains a Folder named Zombies with 5 NPC zombie models.
- Zombies chase the nearest player (PathfindingService).
- Zombie touch deals 15 damage with a short cooldown.
- Add a 90-second survival timer and show simple win/lose UI.`
              }
            ].map((x) => (
              <div key={x.title} className="rounded-3xl border border-slate-700/40 bg-slate-950/40 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-slate-100">{x.title}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-400">Copy this idea into the builder.</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-200">
                    {x.chip}
                  </span>
                </div>
                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-700/35 bg-slate-950/50">
                  <pre className="max-h-[min(240px,40vh)] min-w-0 overflow-auto p-4 text-xs leading-relaxed text-slate-100">
                    <code className="font-mono">{x.prompt}</code>
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4) FAQ */}
      <section id="faq" aria-labelledby="faq-title">
        <div className="rounded-3xl border border-slate-700/40 bg-slate-950/35 p-5 sm:p-7">
          <h2 id="faq-title" className="text-balance text-xl font-extrabold tracking-tight text-slate-50 sm:text-2xl">
            FAQ
          </h2>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              {
                q: "Does it output more than one script?",
                a: "If you ask for multiple systems, the model can return several sections—each with a `-- Script: ...` header so you can split them into separate Script instances in Studio."
              },
              {
                q: "Should I trust generated code blindly?",
                a: "No. Treat it like any generated code: read it, run it in a test place, and only ship what you understand. The UI shows a simple safety hint when patterns look risky—it’s guidance, not a guarantee."
              },
              {
                q: "Do I need images?",
                a: "No. Most flows work with text only. Images are optional (up to 2) when you want the model to align with a look or layout."
              },
              {
                q: "Where do I start?",
                a: "Open the builder, pick a template or write your own prompt, generate, then paste into Studio. Sign in if you want projects stored on the server."
              }
            ].map((x) => (
              <details
                key={x.q}
                className="group rounded-3xl border border-slate-700/40 bg-slate-950/40 p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-extrabold text-slate-100">{x.q}</div>
                    <div className="h-8 w-8 shrink-0 rounded-2xl border border-slate-700/60 bg-slate-900/30 text-center text-sm font-extrabold text-slate-200">
                      +
                    </div>
                  </div>
                </summary>
                <div className="mt-3 text-sm font-semibold leading-relaxed text-slate-400">
                  {x.a.split("`").map((part, idx) =>
                    idx % 2 === 1 ? (
                      <code key={idx} className="rounded bg-slate-900/60 px-1 py-0.5 text-slate-200">
                        {part}
                      </code>
                    ) : (
                      <span key={idx}>{part}</span>
                    )
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 5) Final CTA */}
      <section id="cta" aria-labelledby="cta-title">
        <div className="rounded-3xl border border-cyan-400/25 bg-cyan-400/5 p-5 sm:p-7">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h2
                id="cta-title"
                className="text-balance text-xl font-extrabold tracking-tight text-slate-50 sm:text-2xl"
              >
                Try the builder
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-300 sm:text-base">
                One prompt → Lua you can paste into Studio. Adjust the prompt until behavior matches what you want.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:gap-3">
              <Link
                href="/app"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-cyan-400/20 px-5 py-2.5 font-extrabold text-cyan-100 ring-1 ring-cyan-400/40 hover:bg-cyan-400/25 sm:min-h-0"
              >
                Open the builder
              </Link>
              <Link
                href="/docs"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-900/50 px-5 py-2.5 font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70 sm:min-h-0"
              >
                Read docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="px-1 pt-2 text-center text-xs font-semibold text-slate-500 sm:text-sm">
        VibeCoder — AI-assisted Roblox Lua from natural language. Backend and auth are real; always review generated
        scripts before production use.
      </footer>
    </div>
  );
}
