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
          `${path.basename(source.file)} must live under commands/, components/, or events/. Only middleware and error files may sit at the app root.`,
          { file: source.file },
        );
      }
      continue;
    }

    const category = CATEGORY_DIRS[categoryDir];
    if (category === undefined) {
      diagnostics.error(
        "unknown-category",
        `"${categoryDir}/" is not a route area. Reserved files must live under commands/, components/, or events/.`,
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
      diagnostics.error(
        "file-in-wrong-category",
        `${path.basename(source.file)} does not belong under ${categoryDir}/. Expected one of: ${[...HANDLER_KINDS[category]].map((k) => `${k}.ts`).join(", ")}.`,
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
  if (segments.length === 0) {
    diagnostics.error(
      "route-without-path",
      `${path.basename(file)} needs a named directory. Files directly inside ${category}s/ have no route path.`,
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
          `${formatSegment(segment)} is a dynamic segment, but ${category} routes cannot carry parameters. Only component routes can.`,
          { file },
        );
        return null;
      }
      if (params.includes(segment.name)) {
        diagnostics.error(
          "duplicate-param",
          `Parameter "${segment.name}" appears twice in the same route.`,
          { file },
        );
        return null;
      }
      if (segment.type === "catchAll" && index !== segments.length - 1) {
        diagnostics.error(
          "catch-all-not-last",
          `${formatSegment(segment)} must be the last segment of the route.`,
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

  if (routePath === "") {
    diagnostics.error(
      "route-without-path",
      `${path.basename(file)} sits only inside route groups. Groups do not contribute to the route, so this route has no path.`,
      { file },
    );
    return null;
  }

  const id = `${category}:${routePath}`;
  return { id, shortId: shortId(id), category, kind, path: routePath, segments, params, file };
}

function detectDuplicates(routes: Route[], diagnostics: Diagnostics): void {
  const seen = new Map<string, Route>();
  for (const route of routes) {
    const key = `${route.id}#${route.kind}`;
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, route);
      continue;
    }
    diagnostics.error(
      "duplicate-route",
      `Route ${route.id} is defined twice: ${existing.file} and ${route.file}. Route groups do not make paths distinct.`,
      { file: route.file, route: route.id },
    );
  }
}
