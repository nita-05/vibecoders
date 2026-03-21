import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stable in Next 15; avoids wrong monorepo root when multiple lockfiles exist (e.g. under user profile).
  outputFileTracingRoot: __dirname,
  typedRoutes: true,
};

export default nextConfig;
