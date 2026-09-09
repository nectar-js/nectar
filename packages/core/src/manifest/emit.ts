import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RouteGraph } from "../compiler/graph.js";
import type { Route } from "../compiler/routes.js";
import { version } from "../version.js";
import { MANIFEST_VERSION, type Manifest, type ManifestRoute } from "./schema.js";

export const MANIFEST_FILE = "manifest.json";

/** Serializes a route graph. `outDir` is where the manifest will live; paths are made relative to it. */
export function toManifest(graph: RouteGraph, outDir: string): Manifest {
  const rel = (file: string) => posix(path.relative(graph.appDir, file));
  const base = (route: Route) => {
    const chains = graph.chains.get(route.file) ?? { middleware: [], errors: [] };
    return {
      id: route.id,
      category: route.category,
      path: route.path,
      file: rel(route.file),
      middleware: chains.middleware.map(rel),
      errors: chains.errors.map(rel),
    };
  };

  const routes: ManifestRoute[] = [];
  for (const command of graph.commands) {
    for (const route of Object.values(command.handlers))
      routes.push({ ...base(route), kind: "command" });
  }
  for (const entry of graph.autocomplete) {
    routes.push({ ...base(entry.route), kind: "autocomplete", options: entry.options });
  }
  for (const route of graph.components) {
    routes.push({
      ...base(route),
      kind: route.kind,
      shortId: route.shortId,
      params: route.params,
      catchAll: route.catchAll,
      selectKind: route.selectKind,
      overhead: route.overhead,
    });
  }
  for (const event of graph.events) {
    for (const handler of event.handlers) {
      routes.push({
        ...base(handler.route),
        kind: "event",
        event: event.name,
        once: handler.once,
        order: handler.order,
      });
    }
  }
  routes.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  return {
    version: MANIFEST_VERSION,
    neat: version,
    appDir: posix(path.relative(path.resolve(outDir), graph.appDir)),
    routes,
    commands: graph.commands.map((c) => ({
      name: c.name,
      type: c.type,
      payload: c.payload,
      handlers: Object.fromEntries(Object.entries(c.handlers).map(([k, r]) => [k, r.id])),
    })),
    events: graph.events.map((e) => ({
      name: e.name,
      mode: e.mode,
      handlers: e.handlers.map((h) => h.route.id),
    })),
  };
}

/** Writes `manifest.json` into `outDir` with sorted keys, so identical graphs give identical bytes. */
export function writeManifest(manifest: Manifest, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, MANIFEST_FILE);
  writeFileSync(file, `${stableStringify(manifest)}\n`);
  return file;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (isPlainObject(v) ? sortKeys(v) : v), 2);
}

function sortKeys(object: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) out[key] = object[key];
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function posix(file: string): string {
  return file.split(path.sep).join("/");
}
