import { TopNav } from "@/components/TopNav";

export default function DocsPage() {
  return (
    <div>
      <TopNav />
      <div className="rounded-2xl border border-slate-700/40 bg-slate-950/30 p-7">
        <h1 className="text-2xl font-extrabold tracking-tight">Docs</h1>
        <div className="mt-4 space-y-4 text-slate-300">
          <div>
            <div className="font-bold text-slate-200">1) Run backend</div>
            <div className="mt-1 text-sm">
              Start the FastAPI server and set <code className="rounded bg-slate-900/60 px-1">OPENAI_API_KEY</code> (preferred) or <code className="rounded bg-slate-900/60 px-1">GROQ_API_KEY</code>.
            </div>
          </div>
          <div>
            <div className="font-bold text-slate-200">2) Use script headers</div>
            <div className="mt-1 text-sm">
              Ask the model to include headers like{" "}
              <code className="rounded bg-slate-900/60 px-1">-- Script: ServerScriptService/MyScript</code> for clean
              placement.
            </div>
          </div>
          <div>
            <div className="font-bold text-slate-200">3) Optional images</div>
            <div className="mt-1 text-sm">Attach up to 2 images to guide generation.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

