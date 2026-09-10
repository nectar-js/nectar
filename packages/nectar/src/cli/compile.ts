import path from "node:path";
import type { Diagnostic } from "../compiler/diagnostics.js";
import { buildGraph, type RouteGraph } from "../compiler/graph.js";
import { checkIntents } from "../events/index.js";
import { applyPlugins } from "../plugins/index.js";
import type { CliIo } from "./io.js";
import type { Project } from "./project.js";
import { c, fail, indent, warn } from "./ui.js";

/**
 * Compiles the app, runs plugin transforms, and prints every diagnostic. Returns `null` when
 * any is an error.
 */
export async function compileProject(project: Project, io: CliIo): Promise<RouteGraph | null> {
  const graph = await buildGraph(project.appDir);
  graph.diagnostics.items.push(
    ...checkIntents(graph.events, project.config.intents, path.basename(project.configFile)),
  );
  if (!graph.diagnostics.hasErrors) await applyPlugins(graph, project.config.plugins ?? []);
  for (const diagnostic of graph.diagnostics.items) {
    io.err(formatDiagnostic(diagnostic, project.root));
  }
  if (graph.diagnostics.hasErrors) {
    const errors = graph.diagnostics.items.filter((d) => d.severity === "error").length;
    io.err(fail(`${errors} error${errors === 1 ? "" : "s"}. Fix the files above and run again.`));
    return null;
  }
  return graph;
}

/**
 * One diagnostic as a headline and an indented message:
 *
 *     ✖ error  invalid-name  app/commands/Bad Name/command.ts
 *       Command names must be lowercase ...
 */
export function formatDiagnostic(diagnostic: Diagnostic, root: string): string {
  const mark = diagnostic.severity === "error" ? fail(c.red("error")) : warn(c.yellow("warning"));
  const where = diagnostic.file === undefined ? "" : `  ${relative(root, diagnostic.file)}`;
  return [`${mark}  ${c.dim(diagnostic.code)}${where}`, ...indent([diagnostic.message])].join("\n");
}

export function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

export function summary(graph: RouteGraph): string {
  const n = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  return [
    n(graph.commands.length, "command"),
    n(graph.components.length, "component route"),
    n(graph.events.length, "event"),
  ].join(", ");
}
