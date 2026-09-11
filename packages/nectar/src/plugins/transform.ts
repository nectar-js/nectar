import { existsSync } from "node:fs";
import path from "node:path";
import type { RouteGraph } from "../compiler/graph.js";
import { toManifest } from "../manifest/emit.js";
import type { NectarPlugin, PluginChange, PluginGraph } from "./index.js";

/** A frozen copy of the graph in manifest shape, with absolute file paths. */
export function pluginGraph(graph: RouteGraph): PluginGraph {
  const manifest = toManifest(graph, graph.appDir);
  const absolute = (file: string) => path.join(graph.appDir, ...file.split("/"));
  // Cloned because the manifest shares arrays and payloads with the graph itself.
  return deepFreeze(
    structuredClone({
      appDir: graph.appDir,
      routes: manifest.routes.map((route) => ({
        ...route,
        file: absolute(route.file),
        middleware: route.middleware.map(absolute),
        errors: route.errors.map(absolute),
      })),
      commands: manifest.commands,
      events: manifest.events,
    }),
  );
}

/**
 * Runs every plugin's `transform` in config order and applies the returned changes to the
 * graph. Problems become diagnostics; a plugin never mutates the graph directly.
 */
export async function applyPlugins(
  graph: RouteGraph,
  plugins: readonly NectarPlugin[],
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.transform === undefined) continue;
    let changes: PluginChange[];
    try {
      changes = (await plugin.transform(pluginGraph(graph))) ?? [];
    } catch (error) {
      graph.diagnostics.error(
        "plugin-failed",
        `Plugin "${plugin.name}" threw while transforming routes: ${describe(error)}`,
      );
      continue;
    }
    if (!Array.isArray(changes)) {
      graph.diagnostics.error(
        "plugin-invalid-change",
        `Plugin "${plugin.name}" returned ${typeof changes} from transform. Return an array of changes, or nothing.`,
      );
      continue;
    }
    for (const change of changes) apply(graph, plugin.name, change);
  }
}

function apply(graph: RouteGraph, plugin: string, change: PluginChange): void {
  const type: unknown = isRecord(change) ? change.type : undefined;
  if (type !== "middleware" && type !== "diagnostic") {
    graph.diagnostics.error(
      "plugin-invalid-change",
      `Plugin "${plugin}" returned a change with type ${JSON.stringify(type)}. A change's type is "middleware" or "diagnostic".`,
    );
    return;
  }
  if (change.type === "diagnostic") {
    const { severity, code, message, file, route } = change;
    graph.diagnostics.items.push({
      code,
      severity: severity === "error" ? "error" : "warning",
      message,
      ...(file === undefined ? {} : { file }),
      ...(route === undefined ? {} : { route }),
    });
    return;
  }

  const routes = graph.routes.filter(
    (r) => r.id === change.route && (change.kind === undefined || r.kind === change.kind),
  );
  const target = change.kind === undefined ? change.route : `${change.route} (${change.kind})`;
  if (routes.length === 0) {
    graph.diagnostics.error(
      "plugin-unknown-route",
      `Plugin "${plugin}" adds middleware to route "${target}", which does not exist. Route IDs look like "command:moderation/ban".`,
    );
    return;
  }
  if (routes.some((r) => r.category === "event")) {
    graph.diagnostics.error(
      "plugin-invalid-change",
      `Plugin "${plugin}" adds middleware to route "${target}", but event handlers don't run middleware.`,
      { route: change.route },
    );
    return;
  }
  if (
    typeof change.file !== "string" ||
    !path.isAbsolute(change.file) ||
    !existsSync(change.file)
  ) {
    graph.diagnostics.error(
      "plugin-missing-file",
      `Plugin "${plugin}" adds middleware from ${JSON.stringify(change.file)}, which is not an absolute path to an existing file.`,
      { route: change.route },
    );
    return;
  }
  const file = path.normalize(change.file);
  for (const route of routes) {
    const chains = graph.chains.get(route.file);
    if (chains === undefined || chains.middleware.includes(file)) continue;
    if (change.position === "inner") chains.middleware.push(file);
    else chains.middleware.unshift(file);
    const touched = graph.plugins.get(route.file) ?? [];
    if (!touched.includes(plugin)) graph.plugins.set(route.file, [...touched, plugin]);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
