// Test-only ESM resolve hook: lets `node --test` resolve extensionless
// relative imports (`./foo`) to `./foo.ts` / `./foo.tsx`, matching how
// Next.js/tsc resolve them. Not used by the app build.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXTS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[mc]?[jt]sx?$/.test(specifier)) {
    try {
      const base = new URL(specifier, context.parentURL);
      for (const ext of EXTS) {
        const candidate = new URL(base.href + ext);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + ext, context);
        }
      }
    } catch {
      /* fall through to default resolution */
    }
  }
  return nextResolve(specifier, context);
}
