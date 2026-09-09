import path from "node:path";
import type { Diagnostic } from "../compiler/diagnostics.js";
import { buildGraph, type RouteGraph } from "../compiler/graph.js";
import type { CliIo } from "./io.js";
import type { Project } from "./project.js";

/** Compiles the app and prints every diagnostic. Returns `null` when any is an error. */
export async function compileProject(project: Project, io: CliIo): Promise<RouteGraph | null> {
  const graph = await buildGraph(project.appDir);
  for (const diagnostic of graph.diagnostics.items) {
    io.err(formatDiagnostic(diagnostic, project.root));
  }
  if (graph.diagnostics.hasErrors) {
    const errors = graph.diagnostics.items.filter((d) => d.severity === "error").length;
    io.err(`${errors} error${errors === 1 ? "" : "s"}.`);
    return null;
  }
  return graph;
}

export function formatDiagnostic(diagnostic: Diagnostic, root: string): string {
  const where = diagnostic.file === undefined ? "" : ` ${relative(root, diagnostic.file)}`;
  return `${diagnostic.severity}[${diagnostic.code}]${where}: ${diagnostic.message}`;
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
