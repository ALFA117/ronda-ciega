/**
 * Lets `node --test` load the app's own modules.
 *
 * Next resolves `./constants` and `@/lib/x` through webpack; Node's ESM
 * resolver requires a real path with an extension. Rather than rewrite every
 * import in the app to suit the test runner — which would make the source
 * worse to serve the tests — this maps the same two rules the bundler applies.
 *
 * JSX is deliberately not handled: Node strips types, not syntax, so anything
 * that needs a .tsx is testable only through the browser suite.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".json"];
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

function firstExisting(base) {
  if (existsSync(base) && !base.endsWith("/")) {
    // A bare file that already exists (with extension).
    return base;
  }
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of EXTS) {
    const candidate = resolvePath(base, "index" + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let target = null;

  if (specifier.startsWith("@/")) {
    target = firstExisting(resolvePath(ROOT, specifier.slice(2)));
  } else if (specifier.startsWith(".") && context.parentURL) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    target = firstExisting(resolvePath(parentDir, specifier));
  }

  if (target) {
    const url = pathToFileURL(target).href;
    // JSON still needs its attribute; supply it so app modules that import
    // an .json file do not have to spell it out for the runner's benefit.
    if (target.endsWith(".json")) {
      return { url, format: "json", importAttributes: { type: "json" }, shortCircuit: true };
    }
    return { url, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
