import path from "node:path";
import { ApplicationCommandType } from "discord-api-types/v10";
import type { RouteGraph } from "../compiler/graph.js";
import type { Route } from "../compiler/routes.js";
import type { ComponentRoute } from "../components/compile.js";
import { compileProject, relative } from "./compile.js";
import { type CliIo, EXIT_FAILURE, EXIT_OK } from "./io.js";
import { loadProject } from "./project.js";

/** `nect routes`: print the app tree with what every file and directory means. */
export async function routes(io: CliIo): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const graph = await compileProject(project, io);
  if (graph === null) return EXIT_FAILURE;
  io.out(renderRoutes(graph, project.root));
  return EXIT_OK;
}

interface Node {
  name: string;
  notes: string[];
  children: Map<string, Node>;
  /** Files sort before directories. */
  file: boolean;
}

/**
 * A directory tree of the app. Handler files annotate their directory; middleware, error, and
 * route files appear as leaves so the scope of each is where it sits in the tree.
 */
export function renderRoutes(graph: RouteGraph, root: string): string {
  const tree: Node = {
    name: relative(root, graph.appDir) || ".",
    notes: [],
    children: new Map(),
    file: false,
  };
  const nodeFor = (file: string, asFile: boolean): Node => {
    const parts = relative(graph.appDir, asFile ? file : path.dirname(file)).split("/");
    let node = tree;
    for (const part of parts.filter((p) => p !== "" && p !== ".")) {
      let child = node.children.get(part);
      if (child === undefined) {
        child = { name: part, notes: [], children: new Map(), file: false };
        node.children.set(part, child);
      }
      node = child;
    }
    node.file = asFile;
    return node;
  };
  const annotate = (route: Route, note: string) => nodeFor(route.file, false).notes.push(note);

  for (const command of graph.commands) {
    for (const [position, route] of Object.entries(command.handlers)) {
      annotate(route, commandLabel(command.type, command.name, position));
    }
  }
  for (const entry of graph.autocomplete) {
    annotate(entry.route, `autocomplete: ${entry.options.join(", ")}`);
  }
  for (const route of graph.components) annotate(route, componentLabel(route));
  for (const event of graph.events) {
    for (const handler of event.handlers) {
      const flags = [handler.once ? "once" : null, event.handlers.length > 1 ? event.mode : null];
      annotate(handler.route, `event ${event.name}${suffix(flags)}`);
    }
  }
  for (const boundary of graph.boundaries) {
    const node = nodeFor(boundary.file, true);
    if (boundary.kind === "route") {
      node.notes.push("command metadata");
      continue;
    }
    const covered = graph.routes.filter((r) => {
      const chain = graph.chains.get(r.file);
      return (boundary.kind === "middleware" ? chain?.middleware : chain?.errors)?.includes(
        boundary.file,
      );
    }).length;
    node.notes.push(
      `${boundary.kind === "middleware" ? "middleware" : "error boundary"} for ${covered} route${covered === 1 ? "" : "s"}`,
    );
  }

  const lines: [string, string][] = [];
  print(tree, "", true, true, lines);
  const width = Math.max(...lines.map(([left]) => left.length));
  return lines
    .map(([left, right]) => (right === "" ? left : `${left.padEnd(width)}  ${right}`))
    .join("\n");
}

function print(
  node: Node,
  prefix: string,
  last: boolean,
  isRoot: boolean,
  out: [string, string][],
) {
  const branch = isRoot ? "" : last ? "└── " : "├── ";
  out.push([`${prefix}${branch}${node.name}`, node.notes.join(" · ")]);
  const children = [...node.children.values()].sort(
    (a, b) => Number(b.file) - Number(a.file) || a.name.localeCompare(b.name),
  );
  const childPrefix = isRoot ? "" : `${prefix}${last ? "    " : "│   "}`;
  children.forEach((child, i) => {
    print(child, childPrefix, i === children.length - 1, false, out);
  });
}

function commandLabel(type: ApplicationCommandType, name: string, position: string): string {
  if (type === ApplicationCommandType.User) return `user context menu "${name}"`;
  if (type === ApplicationCommandType.Message) return `message context menu "${name}"`;
  return `/${[name, ...position.split("/").filter((p) => p !== "")].join(" ")}`;
}

function componentLabel(route: ComponentRoute): string {
  const kind = route.kind === "select" ? `select (${route.selectKind})` : route.kind;
  const pattern = [
    `n:${route.shortId}`,
    ...route.params.map((p) => (p === route.catchAll ? `<...${p}>` : `<${p}>`)),
  ].join(":");
  return `${kind} ${pattern}`;
}

function suffix(flags: (string | null)[]): string {
  const present = flags.filter((f): f is string => f !== null);
  return present.length === 0 ? "" : ` (${present.join(", ")})`;
}
