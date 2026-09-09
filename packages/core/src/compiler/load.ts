import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Imports an application module by absolute path.
 *
 * Relies on Node's native TypeScript type stripping (unflagged since 22.18), so handler
 * files must use erasable syntax only: no enums, namespaces, or parameter properties.
 *
 * With reloading enabled (see `enableModuleReloading`) the URL carries a version query, so a
 * changed file evaluates again on the next import instead of coming back from the ESM cache.
 */
export async function loadModule(file: string): Promise<Record<string, unknown>> {
  const url = pathToFileURL(file).href;
  return (await import(reloading === null ? url : versioned(url))) as Record<string, unknown>;
}

interface Reloading {
  /** Project root; only files under it (outside `node_modules`) are versioned. */
  root: string;
  /** Bumped by `invalidateModuleGraph` so every project module evaluates again. */
  generation: number;
}

let reloading: Reloading | null = null;

/**
 * Turns on cache busting for project files. Used by `nect dev` only.
 *
 * Every import of a file under `root` gets `?nect=<content hash>-<generation>` appended, the
 * direct ones here and the transitive ones through a resolve hook. A handler whose content
 * changed therefore gets a new URL and a fresh evaluation; its unchanged imports keep their
 * URL and are shared. Old instances stay in the ESM cache until the process exits.
 */
export function enableModuleReloading(root: string): void {
  if (reloading !== null) return;
  reloading = { root: path.resolve(root), generation: 0 };
  registerHooks({
    resolve(specifier, context, next) {
      const result = next(specifier, context);
      return { ...result, url: versioned(result.url) };
    },
  });
}

/**
 * Makes every project module evaluate again on its next import. For changes to files the
 * compiler does not track (helpers a handler imports), since nothing knows who imports them.
 */
export function invalidateModuleGraph(): void {
  if (reloading !== null) reloading.generation += 1;
}

function versioned(url: string): string {
  if (reloading === null || !url.startsWith("file:") || url.includes("?") || url.includes("#")) {
    return url;
  }
  const file = fileURLToPath(url);
  const inside = !path.relative(reloading.root, file).startsWith("..");
  if (!inside || file.split(path.sep).includes("node_modules")) return url;
  let hash: string;
  try {
    hash = createHash("sha1").update(readFileSync(file)).digest("base64url").slice(0, 10);
  } catch {
    return url;
  }
  return `${url}?nect=${hash}-${reloading.generation}`;
}
