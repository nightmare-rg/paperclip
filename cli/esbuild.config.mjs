/**
 * esbuild configuration for building the paperclipai CLI.
 *
 * Bundles workspace packages; npm deps and @paperclipai/server stay external.
 * Wenn du dist/ in den npx-Cache kopierst, nutzt "npx paperclipai run" deinen Build
 * und die node_modules aus dem Cache (zod etc.).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const workspacePaths = [
  "cli",
  "packages/db",
  "packages/shared",
  "packages/adapter-utils",
  "packages/adapters/claude-local",
  "packages/adapters/codex-local",
  "packages/adapters/openclaw-gateway",
];
const externalWorkspacePackages = new Set(["@paperclipai/server"]);

const externals = new Set(externalWorkspacePackages);
for (const p of workspacePaths) {
  const pkgPath = resolve(repoRoot, p, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  for (const name of Object.keys(pkg.dependencies || {})) {
    if (externalWorkspacePackages.has(name) || !name.startsWith("@paperclipai/")) externals.add(name);
  }
  for (const name of Object.keys(pkg.optionalDependencies || {})) { externals.add(name); }
}

/** @type {import('esbuild').BuildOptions} */
export default {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/index.js",
  banner: { js: "#!/usr/bin/env node" },
  external: [...externals].sort(),
  treeShaking: true,
  sourcemap: true,
};
