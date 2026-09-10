import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import type { Boundary, Route, RouteTable } from "../src/compiler/index.js";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Writes an app tree into a fresh temp directory. Keys are posix paths relative to the app root. */
export function makeApp(files: Record<string, string> | string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), "nectar-app-"));
  created.push(root);
  const entries = Array.isArray(files) ? files.map((f) => [f, ""] as const) : Object.entries(files);
  for (const [relative, content] of entries) {
    const full = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

/** Strips machine-specific paths so a table can be compared or snapshotted. */
export function normalize(table: RouteTable, root: string) {
  const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
  const route = (r: Route) => ({ ...r, file: rel(r.file) });
  const boundary = (b: Boundary) => ({ ...b, file: rel(b.file) });
  return {
    routes: table.routes.map(route),
    boundaries: table.boundaries.map(boundary),
    diagnostics: table.diagnostics.items.map((d) => ({
      ...d,
      ...(d.file === undefined ? {} : { file: rel(d.file) }),
      message: d.message.replaceAll(root, "<app>").replaceAll(path.sep, "/"),
    })),
  };
}

/** A throwaway project: a plain-object config plus the given app files. */
export function makeProject(files: Record<string, string>, config = "{ intents: [] }"): string {
  const root = mkdtempSync(path.join(tmpdir(), "nectar-cli-"));
  created.push(root);
  writeFileSync(path.join(root, "nectar.config.js"), `export default ${config};\n`);
  mkdirSync(path.join(root, "app"));
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, "app", ...relative.split("/"));
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}
