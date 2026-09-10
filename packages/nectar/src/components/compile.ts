import path from "node:path";
import { Diagnostics } from "../compiler/diagnostics.js";
import { loadModule } from "../compiler/load.js";
import type { Route, RouteTable } from "../compiler/routes.js";
import { formatSegment } from "../compiler/segments.js";
import { BASE_OVERHEAD, encodeCustomId, MAX_CUSTOM_ID_LENGTH } from "./customId.js";
import { paramValidatorsOf } from "./params.js";

export type ComponentKind = "button" | "select" | "modal";

export type SelectKind = "string" | "user" | "role" | "channel" | "mentionable";

const SELECT_KINDS: ReadonlySet<string> = new Set([
  "string",
  "user",
  "role",
  "channel",
  "mentionable",
]);

export interface ComponentRoute extends Route {
  category: "component";
  kind: ComponentKind;
  /** The `kind` export of a `select.ts`. `null` for buttons and modals. */
  selectKind: SelectKind | null;
  /** Name of the trailing catch-all parameter, if the route has one. */
  catchAll: string | null;
  /** Characters of the encoded custom ID taken by the prefix, short ID, and separators. */
  overhead: number;
}

export interface CompiledComponents {
  routes: ComponentRoute[];
  diagnostics: Diagnostics;
}

/** Values for one route's parameters. A catch-all parameter takes an array. */
export type ComponentParams = Record<string, string | readonly string[]>;

/** Validates the component routes of a route table and resolves their select kinds. */
export async function compileComponents(table: RouteTable): Promise<CompiledComponents> {
  const diagnostics = new Diagnostics();
  const candidates = table.routes.filter((r) => r.category === "component");

  // Each route reports into its own list, so diagnostics come out in route order rather than
  // in whatever order the imports finish.
  const results = await Promise.all(
    candidates.map(async (route) => {
      const own = new Diagnostics();
      return { route: await compileRoute(route, own), diagnostics: own };
    }),
  );
  const routes: ComponentRoute[] = [];
  for (const result of results) {
    diagnostics.items.push(...result.diagnostics.items);
    if (result.route !== null) routes.push(result.route);
  }

  detectShortIdCollisions(routes, diagnostics);
  detectDuplicatePatterns(routes, diagnostics);

  return { routes, diagnostics };
}

/** What the encoder needs from a route. Compiled, manifest, and registered routes all satisfy it. */
export interface EncodableRoute {
  id: string;
  shortId: string;
  params: string[];
  catchAll: string | null;
}

/**
 * Encodes a custom ID for a compiled route. Throws when a parameter is missing, a value is not
 * a string, or the result exceeds Discord's limit.
 */
export function customIdFor(route: EncodableRoute, params: ComponentParams = {}): string {
  const values: string[] = [];
  for (const name of route.params) {
    const value = params[name];
    if (name === route.catchAll) {
      if (value === undefined) continue;
      if (typeof value === "string") {
        values.push(value);
        continue;
      }
      values.push(...value);
      continue;
    }
    if (typeof value !== "string") {
      throw new TypeError(
        `Route ${route.id} needs a string for parameter "${name}", got ${describe(value)}.`,
      );
    }
    values.push(value);
  }
  for (const name of Object.keys(params)) {
    if (!route.params.includes(name)) {
      throw new TypeError(
        `Route ${route.id} has no parameter "${name}". ${route.params.length === 0 ? "It takes none." : `It takes: ${route.params.join(", ")}.`}`,
      );
    }
  }
  return encodeCustomId(route.shortId, values, route.id);
}

async function compileRoute(
  route: Route,
  diagnostics: Diagnostics,
): Promise<ComponentRoute | null> {
  const kind = route.kind as ComponentKind;
  const last = route.segments.at(-1);
  const catchAll = last?.type === "catchAll" ? last.name : null;
  const overhead = BASE_OVERHEAD + route.params.length;

  if (catchAll !== null) {
    diagnostics.warn(
      "catch-all-route",
      `${formatSegment(last as NonNullable<typeof last>)} accepts any number of values. Every value counts against Discord's ${MAX_CUSTOM_ID_LENGTH} character custom ID limit, and generation throws when it is exceeded.`,
      { file: route.file, route: route.id },
    );
  }

  let module: Record<string, unknown>;
  try {
    module = await loadModule(route.file);
  } catch (error) {
    diagnostics.error(
      "module-load-failed",
      `Could not import this file: ${error instanceof Error ? error.message : String(error)}`,
      { file: route.file, route: route.id },
    );
    return null;
  }

  if (!checkDeclaredRoute(module, route, diagnostics)) return null;
  try {
    paramValidatorsOf(module.default, route);
  } catch (error) {
    diagnostics.error(
      "invalid-param-validator",
      `${error instanceof Error ? error.message : String(error)} Pass validators as defineComponent's third argument: { params: { name: (value) => ... } }.`,
      { file: route.file, route: route.id },
    );
    return null;
  }

  let selectKind: SelectKind | null = null;
  if (kind === "select") {
    selectKind = validateSelectKind(module, route, diagnostics);
    if (selectKind === null) return null;
  }

  return { ...route, category: "component", kind, selectKind, catchAll, overhead };
}

/** A handler made with `defineComponent(path, ...)` must name the route its file sits in. */
export function checkDeclaredRoute(
  module: Record<string, unknown>,
  route: Route,
  diagnostics: Diagnostics,
  expected = route.path,
): boolean {
  const handler = module.default;
  if (typeof handler !== "function") return true;
  const declared = (handler as { route?: unknown }).route;
  if (declared === undefined || declared === expected) return true;
  diagnostics.error(
    "route-mismatch",
    `This file is the route "${expected}" but its handler declares "${String(declared)}". Update the string or move the file.`,
    { file: route.file, route: route.id },
  );
  return false;
}

function validateSelectKind(
  module: Record<string, unknown>,
  route: Route,
  diagnostics: Diagnostics,
): SelectKind | null {
  const kind = module.kind;
  if (kind === undefined) {
    diagnostics.error(
      "missing-select-kind",
      'select.ts must export `kind`: "string", "user", "role", "channel", or "mentionable".',
      { file: route.file, route: route.id },
    );
    return null;
  }
  if (typeof kind !== "string" || !SELECT_KINDS.has(kind)) {
    diagnostics.error(
      "invalid-select-kind",
      `\`kind\` is ${describe(kind)}. Expected "string", "user", "role", "channel", or "mentionable".`,
      { file: route.file, route: route.id },
    );
    return null;
  }
  return kind as SelectKind;
}

function detectShortIdCollisions(routes: ComponentRoute[], diagnostics: Diagnostics): void {
  const seen = new Map<string, ComponentRoute>();
  for (const route of routes) {
    const existing = seen.get(route.shortId);
    if (existing === undefined || existing.id === route.id) {
      seen.set(route.shortId, route);
      continue;
    }
    diagnostics.error(
      "short-id-collision",
      `${route.id} and ${existing.id} hash to the same short ID "${route.shortId}", so their custom IDs would be indistinguishable. Rename one of the directories.`,
      { file: route.file, route: route.id },
    );
  }
}

/**
 * Two routes of the same kind whose paths differ only in parameter names, like
 * `tickets/[id]/close` and `tickets/[ticketId]/close`, would both claim the same custom IDs.
 */
function detectDuplicatePatterns(routes: ComponentRoute[], diagnostics: Diagnostics): void {
  const seen = new Map<string, ComponentRoute>();
  for (const route of routes) {
    const shape = route.segments
      .filter((s) => s.type !== "group")
      .map((s) => (s.type === "static" ? s.name : s.type === "dynamic" ? "[]" : "[...]"))
      .join("/");
    const key = `${route.kind}#${shape}`;
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, route);
      continue;
    }
    if (existing.id === route.id) continue;
    diagnostics.error(
      "duplicate-component-pattern",
      `${route.id} has the same shape as ${existing.id} (${relative(existing.file)}). Parameter names do not make routes distinct.`,
      { file: route.file, route: route.id },
    );
  }
}

function describe(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : typeof value;
}

function relative(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}
