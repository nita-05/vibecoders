import { TopNav } from "@/components/TopNav";

export default function DocsPage() {
  return (
    <div>
      <TopNav />
      <div className="rounded-2xl border border-slate-700/40 bg-slate-950/40 p-4 sm:p-7">
        <h1 className="text-2xl font-extrabold tracking-tight">Docs</h1>
        <p className="mt-2 text-sm text-slate-400">
          Short reference for this repo. For deployment, point the frontend at your API with{" "}
          <code className="rounded bg-slate-900/60 px-1">NEXT_PUBLIC_API_BASE</code>.
        </p>
        <div className="mt-4 space-y-4 text-slate-300">
          <div>
            <div className="font-bold text-slate-200">1) Backend API</div>
            <div className="mt-1 text-sm">
              FastAPI app: set <code className="rounded bg-slate-900/60 px-1">OPENAI_API_KEY</code> (or Groq per README),
              <code className="rounded bg-slate-900/60 px-1"> DATABASE_URL</code> for accounts/projects,{" "}
              <code className="rounded bg-slate-900/60 px-1">JWT_SECRET</code> and{" "}
              <code className="rounded bg-slate-900/60 px-1">CORS_ALLOW_ORIGINS</code> in production.
            </div>
          </div>
          <div>
            <div className="font-bold text-slate-200">2) Script headers</div>
            <div className="mt-1 text-sm">
              Ask for headers like{" "}
              <code className="rounded bg-slate-900/60 px-1">-- Script: ServerScriptService/MyScript</code> so you know
              where each block belongs in Studio.
            </div>
          </div>
          <div>
            <div className="font-bold text-slate-200">3) Images &amp; Studio plugin</div>
            <div className="mt-1 text-sm">
              Up to 2 images can guide generation. The Roblox plugin uses the same API base URL as your backend, your
              JWT from the web app, and the per-project sync key shown in the builder sidebar.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

