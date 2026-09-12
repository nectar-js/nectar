import path from "node:path";
import { Diagnostics } from "./diagnostics.js";
import { discover, type FileKind, type SourceFile } from "./discover.js";
import { shortId } from "./identity.js";
import { formatSegment, parseSegment, type Segment } from "./segments.js";

export type RouteCategory = "command" | "component" | "event";

export type RouteKind = "command" | "autocomplete" | "button" | "select" | "modal" | "event";

export interface Route {
  /** Canonical identity, `<category>:<path>`. */
  id: string;
  /** Six character hash of `id`, used in custom IDs. */
  shortId: string;
  category: RouteCategory;
  kind: RouteKind;
  /** Segments joined by `/`. Groups are stripped, except for events where they keep handlers distinct. */
  path: string;
  /** Every segment below the category directory, groups included. */
  segments: Segment[];
  /** Dynamic and catch-all parameter names, in route order. */
  params: string[];
  /** Absolute path of the handler file. */
  file: string;
}

export type BoundaryKind = "middleware" | "error" | "route";

export interface Boundary {
  kind: BoundaryKind;
  /** `null` at the app root, otherwise the category the boundary lives under. */
  category: RouteCategory | null;
  /** Segments below the category directory, groups included. Empty at the category root. */
  segments: Segment[];
  file: string;
}

export interface RouteTable {
  routes: Route[];
  boundaries: Boundary[];
  diagnostics: Diagnostics;
}

const CATEGORY_DIRS: Record<string, RouteCategory> = {
  commands: "command",
  components: "component",
  events: "event",
};

const HANDLER_KINDS: Record<RouteCategory, ReadonlySet<FileKind>> = {
  command: new Set(["command", "autocomplete"]),
  component: new Set(["button", "select", "modal"]),
  event: new Set(["event"]),
};

const BOUNDARY_KINDS: ReadonlySet<FileKind> = new Set(["middleware", "error", "route"]);

/** A directory name for the examples in messages. */
const EXAMPLE_DIR: Record<RouteCategory, string> = {
  command: "ping",
  component: "confirm",
  event: "messageCreate",
};

/** Discovers the app directory and builds the route table. */
export function buildRouteTable(appDir: string): RouteTable {
  return buildRouteTableFromFiles(discover(appDir));
}

export function buildRouteTableFromFiles(files: SourceFile[]): RouteTable {
  const diagnostics = new Diagnostics();
  const routes: Route[] = [];
  const boundaries: Boundary[] = [];

  for (const source of files) {
    const [categoryDir, ...rest] = source.dirs;

    if (categoryDir === undefined) {
      if (source.kind === "middleware" || source.kind === "error") {
        boundaries.push({ kind: source.kind, category: null, segments: [], file: source.file });
      } else {
        diagnostics.error(
          "file-outside-category",
          `${path.basename(source.file)} is directly in the app directory, where only middleware and error files go. Move it under commands/, components/, or events/.`,
          { file: source.file },
        );
      }
      continue;
    }

    const category = CATEGORY_DIRS[categoryDir];
    if (category === undefined) {
      const name = path.basename(source.file);
      diagnostics.error(
        "unknown-category",
        `${name} is in ${categoryDir}/, which isn't a route directory. Nectar treats every file named ${name} as a route file, so move it under commands/, components/, or events/, or rename it.`,
        { file: source.file },
      );
      continue;
    }

    const segments = parseSegments(rest, source, diagnostics);
    if (segments === null) continue;

    if (BOUNDARY_KINDS.has(source.kind)) {
      boundaries.push({
        kind: source.kind as BoundaryKind,
        category,
        segments,
        file: source.file,
      });
      continue;
    }

    if (!HANDLER_KINDS[category].has(source.kind)) {
      const home = Object.entries(CATEGORY_DIRS).find(([, c]) => HANDLER_KINDS[c].has(source.kind));
      diagnostics.error(
        "file-in-wrong-category",
        `${path.basename(source.file)} belongs under ${home?.[0]}/, not ${categoryDir}/.`,
        { file: source.file },
      );
      continue;
    }

    const route = makeRoute(category, source.kind as RouteKind, segments, source.file, diagnostics);
    if (route !== null) routes.push(route);
  }

  detectDuplicates(routes, diagnostics);

  return { routes, boundaries, diagnostics };
}

function parseSegments(
  dirs: string[],
  source: SourceFile,
  diagnostics: Diagnostics,
): Segment[] | null {
  const segments: Segment[] = [];
  for (const dir of dirs) {
    const result = parseSegment(dir);
    if (!result.ok) {
      diagnostics.error("invalid-segment", result.reason, { file: source.file });
      return null;
    }
    segments.push(result.segment);
  }
  return segments;
}

function makeRoute(
  category: RouteCategory,
  kind: RouteKind,
  segments: Segment[],
  file: string,
  diagnostics: Diagnostics,
): Route | null {
  const name = path.basename(file);
  const dir = `${category}s`;
  if (segments.length === 0) {
    diagnostics.error(
      "route-without-path",
      `${name} is directly in ${dir}/, so it has no route path. Put it in a named directory, like ${dir}/${EXAMPLE_DIR[category]}/${name}.`,
      { file },
    );
    return null;
  }

  // Events keep their groups in the path, but still need a directory for the event name.
  if (segments.every((segment) => segment.type === "group")) {
    const groups = segments.map(formatSegment).join("/");
    const example =
      category === "event"
        ? `${dir}/${EXAMPLE_DIR[category]}/${groups}/${name}`
        : `${dir}/${groups}/${EXAMPLE_DIR[category]}/${name}`;
    diagnostics.error(
      "route-without-path",
      `${name} is only inside route groups, and groups aren't part of the route path. Put it in a named directory, like ${example}.`,
      { file },
    );
    return null;
  }

  const params: string[] = [];
  for (const [index, segment] of segments.entries()) {
    if (segment.type === "dynamic" || segment.type === "catchAll") {
      if (category !== "component") {
        diagnostics.error(
          "dynamic-segment-not-allowed",
          `${formatSegment(segment)} is a parameter, and only component routes can have parameters. ${
            category === "command"
              ? "Discord registers commands under fixed names, so take input with meta.options instead."
              : "The directory has to be named after a discord.js event, like events/messageCreate/."
          }`,
          { file },
        );
        return null;
      }
      if (params.includes(segment.name)) {
        diagnostics.error(
          "duplicate-param",
          `The parameter "${segment.name}" appears twice in this route. Each parameter becomes a key of the handler's params, so the names have to differ. Rename one of the directories.`,
          { file },
        );
        return null;
      }
      if (segment.type === "catchAll" && index !== segments.length - 1) {
        diagnostics.error(
          "catch-all-not-last",
          `${formatSegment(segment)} has more directories after it. A catch-all takes all the remaining values, so it has to be the last segment. Use [${segment.name}] if it only needs one value.`,
          { file },
        );
        return null;
      }
      params.push(segment.name);
    }
  }

  const routePath = segments
    .filter((segment) => segment.type !== "group" || category === "event")
    .map(formatSegment)
    .join("/");

  const id = `${category}:${routePath}`;
  return { id, shortId: shortId(id), category, kind, path: routePath, segments, params, file };
}

/**
 * A command and its autocomplete share an ID. A component route has exactly one handler of any
 * kind, since the handler's types come from the path alone.
 */
function detectDuplicates(routes: Route[], diagnostics: Diagnostics): void {
  const seen = new Map<string, Route>();
  for (const route of routes) {
    const key = route.category === "component" ? route.id : `${route.id}#${route.kind}`;
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, route);
      continue;
    }
    const other = relative(existing.file);
    diagnostics.error(
      "duplicate-route",
      existing.kind !== route.kind
        ? `${other} handles the same route, ${route.id}. customId() and the generated types identify a component by its path alone, so each path takes one button.ts, select.ts, or modal.ts. Move one of them into its own directory.`
        : path.dirname(existing.file) === path.dirname(route.file)
          ? `${other} is in the same directory and handles the same route, ${route.id}. Keep one of them.`
          : `${other} is the same route, ${route.id}. Route groups aren't part of the path, so they don't tell the two apart. Rename one of the directories.`,
      { file: route.file, route: route.id },
    );
  }
}

function relative(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}
