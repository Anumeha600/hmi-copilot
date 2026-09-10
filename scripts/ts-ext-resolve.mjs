// Test-only ESM resolve hook. Lets `node --test` resolve:
//   * extensionless relative imports (`./foo` -> `./foo.ts` / `.tsx` / `/index.ts`)
//   * the `@/*` path alias from tsconfig (`@/lib/x` -> `<repo>/src/lib/x`)
// matching how Next.js / tsc resolve them. Not used by the app build.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
const SRC = pathToFileURL(resolvePath(process.cwd(), "src") + "/").href;

function firstThatExists(baseHref) {
  for (const ext of EXTS) {
    const candidate = new URL(baseHref + ext);
    if (existsSync(fileURLToPath(candidate))) return candidate.href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // @/* -> src/*
  if (specifier.startsWith("@/")) {
    const hit = firstThatExists(SRC + specifier.slice(2));
    if (hit) return nextResolve(hit, context);
  }
  // extensionless relative
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[mc]?[jt]sx?$/.test(specifier)) {
    try {
      const hit = firstThatExists(new URL(specifier, context.parentURL).href);
      if (hit) return nextResolve(hit, context);
    } catch {
      /* fall through */
    }
  }
  return nextResolve(specifier, context);
}
