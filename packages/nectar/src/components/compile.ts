import path from "node:path";
import { Diagnostics, typeOf } from "../compiler/diagnostics.js";
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
      `${formatSegment(last as NonNullable<typeof last>)} takes any number of values. They all count toward Discord's ${MAX_CUSTOM_ID_LENGTH} character limit on custom IDs, and customId() throws when an ID goes over.`,
      { file: route.file, route: route.id },
    );
  }

  let module: Record<string, unknown>;
  try {
    module = await loadModule(route.file);
  } catch (error) {
    diagnostics.error(
      "module-load-failed",
      `The compiler imports every route file to read its exports, and this one threw: ${error instanceof Error ? error.message : String(error)}`,
      { file: route.file, route: route.id },
    );
    return null;
  }

  if (!checkHandler(module, route, diagnostics)) return null;
  try {
    paramValidatorsOf(module.default, route);
  } catch (error) {
    diagnostics.error(
      "invalid-param-validator",
      `${error instanceof Error ? error.message : String(error)} Validators go in defineComponent's third argument, like { params: { id: (value) => ... } }.`,
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

/**
 * The default export is the handler Nectar calls, and one made with `defineComponent(path, ...)`
 * or the like must name the route its file sits in.
 */
export function checkHandler(
  module: Record<string, unknown>,
  route: Route,
  diagnostics: Diagnostics,
  expected = route.path,
): boolean {
  const handler = module.default;
  if (typeof handler !== "function") {
    const define =
      route.kind === "command"
        ? "defineCommand"
        : route.kind === "event"
          ? "defineEvent"
          : "defineComponent";
    diagnostics.error(
      "missing-handler",
      `This ${path.basename(route.file)} ${handler === undefined ? "has no default export" : `exports ${typeOf(handler)} as its default`}. Nectar calls the default export when the route runs, so export the handler, like export default ${define}("${expected}", handler).`,
      { file: route.file, route: route.id },
    );
    return false;
  }
  const declared = (handler as { route?: unknown }).route;
  if (declared === undefined || declared === expected) return true;
  diagnostics.error(
    "route-mismatch",
    `This file's route is "${expected}", but its handler says "${String(declared)}". The string types the handler, so it has to match where the file is. Change it to "${expected}", or move the file.`,
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
      'This select.ts doesn\'t export kind, which says what the select menu picks from: "string", "user", "role", "channel", or "mentionable". Add one, like export const kind = "string".',
      { file: route.file, route: route.id },
    );
    return null;
  }
  if (typeof kind !== "string" || !SELECT_KINDS.has(kind)) {
    diagnostics.error(
      "invalid-select-kind",
      `kind is ${describe(kind)}. Use "string", "user", "role", "channel", or "mentionable".`,
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
      `${route.id} and ${existing.id} hash to the same short ID, "${route.shortId}", so Nectar can't tell their custom IDs apart. Rename a directory in one of them.`,
      { file: route.file, route: route.id },
    );
  }
}

/**
 * Two routes of the same kind whose paths differ only in parameter names, like
 * `tickets/[id]/close` and `tickets/[ticketId]/close`. Their hashes differ, but they take the
 * same values in the same places, so they are one route split in two.
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
      `${route.id} is the same path as ${existing.id} in ${relative(existing.file)}, with a different parameter name. Parameter names don't make routes distinct. Merge the two and keep one name.`,
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
