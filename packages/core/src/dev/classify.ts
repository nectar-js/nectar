import path from "node:path";
import { reservedKind } from "../compiler/discover.js";
import { stableStringify } from "../manifest/emit.js";
import type { Manifest } from "../manifest/schema.js";

/**
 * What a changed path means for the dev server, decided from the path alone.
 *
 * - `config`: the config file. The runtime restarts.
 * - `route`: a reserved file or a directory under the app directory. The app recompiles and
 *   the manifest diff decides what else follows.
 * - `dependency`: any other source file. Every module evaluates again on next use, since
 *   nothing tracks who imports it.
 * - `ignored`: build output, `node_modules`, `.git`, tests, non-source files.
 */
export type ChangeKind = "config" | "route" | "dependency" | "ignored";

export interface ProjectPaths {
  configFile: string;
  appDir: string;
  outDir: string;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".mts", ".mjs", ".cts", ".cjs", ".json"]);

export function classifyPath(file: string, project: ProjectPaths): ChangeKind {
  const absolute = path.resolve(file);
  if (absolute === path.resolve(project.configFile)) return "config";
  const parts = absolute.split(path.sep);
  if (
    parts.includes("node_modules") ||
    parts.includes(".git") ||
    within(project.outDir, absolute)
  ) {
    return "ignored";
  }
  const name = path.basename(absolute);
  if (within(project.appDir, absolute)) {
    // No extension: a directory was created, renamed, or removed. Its files may not report.
    if (path.extname(name) === "" || reservedKind(name) !== undefined) return "route";
  }
  if (!SOURCE_EXTENSIONS.has(path.extname(name))) return "ignored";
  if (/\.(test|spec)\.[cm]?[jt]s$/.test(name)) return "ignored";
  return "dependency";
}

function within(dir: string, file: string): boolean {
  const rel = path.relative(path.resolve(dir), file);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** What a recompile changed, and therefore what the running app must do about it. */
export interface ManifestDelta {
  /** Routes, chains, events, or handler positions differ. Dispatch tables must be rebuilt. */
  structure: boolean;
  /** Registration payloads differ. Dev guild commands must be re-registered. */
  commands: boolean;
}

export function diffManifests(before: Manifest, after: Manifest): ManifestDelta {
  const payloads = (m: Manifest) => stableStringify(m.commands.map((c) => c.payload));
  const shape = (m: Manifest) =>
    stableStringify({
      routes: m.routes,
      events: m.events,
      commands: m.commands.map(({ payload: _payload, ...rest }) => rest),
    });
  return {
    structure: shape(before) !== shape(after),
    commands: payloads(before) !== payloads(after),
  };
}
