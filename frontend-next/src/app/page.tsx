import Link from "next/link";

import { TopNav } from "@/components/TopNav";

export default function HomePage() {
  return (
    <div className="space-y-14 pb-10">
      <TopNav />

      <section className="rounded-3xl border border-slate-700/35 bg-slate-950/30 p-7">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-400/35 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-100">
                Describe → Roblox Lua
              </span>
              <span className="rounded-full border border-slate-700/50 bg-slate-900/40 px-3 py-1 text-xs font-bold text-slate-200">
                Studio-ready output
              </span>
              <span className="rounded-full border border-indigo-400/35 bg-indigo-400/10 px-3 py-1 text-xs font-bold text-indigo-100">
                Optional images
              </span>
            </div>

            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
              VibeCoder turns ideas into minimal, paste-ready scripts.
            </h1>

            <p className="mt-4 text-base leading-relaxed text-slate-300">
              Write a prompt (and optionally attach up to 2 images) and get clean Roblox Lua with placement headers.
              Great for fast iteration in Roblox Studio.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/app"
                className="rounded-xl bg-cyan-400/20 px-4 py-2 font-bold text-cyan-100 ring-1 ring-cyan-400/40 hover:bg-cyan-400/25"
              >
                Open the builder
              </Link>
              <Link
                href="/docs"
                className="rounded-xl bg-slate-900/50 px-4 py-2 font-bold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
              >
                See how it works
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { k: "Placement headers", v: 'Use "-- Script: ..." blocks for clean install.' },
                { k: "Minimal code", v: "Short, complete scripts (no fluff)." },
                { k: "Refine loop", v: "Regenerate or ask for improvements on existing Lua." }
              ].map((x) => (
                <div key={x.k} className="rounded-2xl border border-slate-700/40 bg-slate-950/30 p-4">
                  <div className="text-sm font-extrabold">{x.k}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-300">{x.v}</div>
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
                <pre className="max-h-[320px] overflow-auto p-4 text-xs leading-relaxed text-slate-100">
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

      <section aria-labelledby="features-title">
        <h2 id="features-title" className="text-2xl font-extrabold tracking-tight">
          Everything you need to prototype fast
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Studio-ready placement",
              desc: "Outputs include clear placement headers, so scripts can be pasted into the right Roblox services."
            },
            { title: "Templates + guided recipes", desc: "Start from proven mechanics and tweak from there." },
            { title: "Projects + recent history", desc: "Keep generations organized per project so you can iterate quickly." }
          ].map((x) => (
            <div key={x.title} className="rounded-3xl border border-slate-700/40 bg-slate-950/30 p-5">
              <div className="text-sm font-extrabold">{x.title}</div>
              <div className="mt-2 text-sm font-semibold text-slate-300">{x.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-title">
        <h2 id="how-title" className="text-2xl font-extrabold tracking-tight">
          How it works
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              n: "1",
              t: "Describe your mechanic",
              d: "Tell the model what you want to happen (and where), optionally with images."
            },
            {
              n: "2",
              t: "Generate minimal Lua",
              d: "Get short, complete scripts with placement headers so you can install quickly."
            },
            {
              n: "3",
              t: "Copy, paste, and refine",
              d: "Iterate in minutes: ask for improvements or regenerate based on feedback."
            }
          ].map((x) => (
            <div key={x.n} className="rounded-3xl border border-slate-700/40 bg-slate-950/30 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-400/15 text-sm font-extrabold text-cyan-100 ring-1 ring-cyan-400/30">
                  {x.n}
                </div>
                <div className="text-sm font-extrabold">{x.t}</div>
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-300">{x.d}</div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="examples-title">
        <h2 id="examples-title" className="text-2xl font-extrabold tracking-tight">
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
            <div key={x.title} className="rounded-3xl border border-slate-700/40 bg-slate-950/30 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold">{x.title}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-400">Copy this idea into the builder.</div>
                </div>
                <span className="rounded-full border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-200">
                  {x.chip}
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700/35 bg-slate-950/50">
                <pre className="max-h-[240px] overflow-auto p-4 text-xs leading-relaxed text-slate-100">
                  <code>{x.prompt}</code>
                </pre>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-2xl font-extrabold tracking-tight">
          FAQ
        </h2>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            {
              q: "Does it generate multiple scripts?",
              a: "Yes. If you ask for multiple systems, you can include placement headers like `-- Script: ServerScriptService/GameManager` and the output will be grouped accordingly."
            },
            {
              q: "Is the code safe to paste into Studio?",
              a: "The generator is designed for minimal, complete scripts. There’s also a lightweight “review first” signal if outputs look risky, but you should still review anything that gets placed into your game."
            },
            {
              q: "Do I need images?",
              a: "No. Text-only prompts work great. Images are optional and can help steer the model toward what you want (up to 2 images)."
            },
            {
              q: "Where do I start?",
              a: "Open `/app`, paste a starter prompt, and iterate: refine the prompt after you test in Studio."
            }
          ].map((x) => (
            <details
              key={x.q}
              className="group rounded-3xl border border-slate-700/40 bg-slate-950/30 p-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-extrabold">{x.q}</div>
                  <div className="h-8 w-8 rounded-2xl border border-slate-700/60 bg-slate-900/30 text-center text-sm font-extrabold text-slate-200">
                    +
                  </div>
                </div>
              </summary>
              <div className="mt-3 text-sm font-semibold text-slate-300 leading-relaxed">
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
      </section>

      <section className="rounded-3xl border border-cyan-400/25 bg-cyan-400/5 p-7">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">Ready to prototype?</h2>
            <p className="mt-2 text-base font-semibold text-slate-300">
              Generate a Roblox Lua script in seconds, then refine until it feels right.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app"
              className="rounded-xl bg-cyan-400/20 px-5 py-2.5 font-extrabold text-cyan-100 ring-1 ring-cyan-400/40 hover:bg-cyan-400/25"
            >
              Open the builder
            </Link>
            <Link
              href="/docs"
              className="rounded-xl bg-slate-900/50 px-5 py-2.5 font-extrabold text-slate-200 ring-1 ring-slate-700/60 hover:bg-slate-900/70"
            >
              Read docs
            </Link>
          </div>
        </div>
      </section>

      <footer className="pt-2 text-center text-sm font-semibold text-slate-500">
        Built for fast Roblox prototyping.
      </footer>
    </div>
  );
}

