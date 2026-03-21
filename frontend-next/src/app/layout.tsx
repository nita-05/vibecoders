import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeCoder",
  description: "Describe → Roblox Lua. Fast prototyping for Roblox Studio."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1020",
  colorScheme: "dark"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-dvh antialiased text-slate-200 selection:bg-cyan-500/25 selection:text-white">
        <div className="mx-auto max-w-7xl px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pb-10 sm:pt-6 lg:px-8">
          {children}
        </div>
      </body>
    </html>
  );
}

