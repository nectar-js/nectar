import { Events } from "discord.js";
import { Diagnostics } from "../compiler/diagnostics.js";
import { loadModule } from "../compiler/load.js";
import type { Route, RouteTable } from "../compiler/routes.js";
import { formatSegment } from "../compiler/segments.js";
import { checkDeclaredRoute } from "../components/compile.js";

/** `export const meta` in an `event.ts`. Every field is optional. */
export interface EventMeta {
  /** Remove the listener after the first call. */
  once?: boolean;
  /** Handlers of the same event run in ascending order. Ties break on route identity. Defaults to 0. */
  order?: number;
  /**
   * How the handlers of this event run relative to each other. Every handler that sets it
   * must agree. Defaults to `"sequential"`.
   */
  mode?: EventMode;
}

export type EventMode = "sequential" | "concurrent";

export interface EventHandler {
  route: Route;
  once: boolean;
  order: number;
}

export interface CompiledEvent {
  /** discord.js event name, for example `guildMemberAdd`. */
  name: string;
  mode: EventMode;
  /** In execution order. */
  handlers: EventHandler[];
}

export interface CompiledEvents {
  events: CompiledEvent[];
  diagnostics: Diagnostics;
}

const EVENT_NAMES: ReadonlySet<string> = new Set(Object.values(Events));

/** Renamed events whose old name still shows up in older discord.js code. */
const RENAMED: Record<string, string> = {
  ready: Events.ClientReady,
};

interface LoadedHandler extends EventHandler {
  name: string;
  mode: EventMode | undefined;
}

/** Groups event routes by discord.js event and validates their names and `meta`. */
export async function compileEvents(table: RouteTable): Promise<CompiledEvents> {
  const diagnostics = new Diagnostics();
  const routes = table.routes.filter((r) => r.kind === "event");

  const loaded = await Promise.all(routes.map((route) => loadHandler(route, diagnostics)));

  const byName = new Map<string, LoadedHandler[]>();
  for (const handler of loaded) {
    if (handler === null) continue;
    byName.set(handler.name, [...(byName.get(handler.name) ?? []), handler]);
  }

  const events: CompiledEvent[] = [];
  for (const [name, handlers] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
    const modes = new Set(handlers.map((h) => h.mode).filter((m) => m !== undefined));
    if (modes.size > 1) {
      for (const handler of handlers) {
        if (handler.mode === undefined) continue;
        diagnostics.error(
          "event-mode-conflict",
          `Handlers of "${name}" set meta.mode to both "concurrent" and "sequential". The mode applies to all of an event's handlers, so set it in one file, or make them match.`,
          { file: handler.route.file, route: handler.route.id },
        );
      }
      continue;
    }
    handlers.sort((a, b) => a.order - b.order || a.route.id.localeCompare(b.route.id));
    events.push({
      name,
      mode: modes.values().next().value ?? "sequential",
      handlers: handlers.map(({ route, once, order }) => ({ route, once, order })),
    });
  }

  return { events, diagnostics };
}

async function loadHandler(route: Route, diagnostics: Diagnostics): Promise<LoadedHandler | null> {
  const name = eventName(route, diagnostics);
  if (name === null) return null;

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

  if (!checkDeclaredRoute(module, route, diagnostics, name)) return null;
  const meta = validateEventMeta(module.meta, route, diagnostics);
  if (meta === null) return null;
  return { route, name, once: meta.once ?? false, order: meta.order ?? 0, mode: meta.mode };
}

function eventName(route: Route, diagnostics: Diagnostics): string | null {
  const statics = route.segments.filter((s) => s.type !== "group");
  const first = statics[0];
  if (first === undefined || first.type !== "static") return null;

  if (statics.length > 1) {
    diagnostics.error(
      "event-nested-path",
      `"${route.path}" has ${statics.slice(1).map(formatSegment).join("/")}/ below the event name, and event handlers go directly in events/<eventName>/. To split an event across files, use route groups, like events/${first.name}/(${statics[1]?.name})/event.ts.`,
      { file: route.file, route: route.id },
    );
    return null;
  }

  const name = first.name;
  if (EVENT_NAMES.has(name)) return name;

  const renamed = RENAMED[name];
  const hint =
    renamed !== undefined
      ? `discord.js renamed it to "${renamed}".`
      : closest(name)
        ? `Did you mean "${closest(name)}"?`
        : "Event directories are named after a value of discord.js's Events enum, like messageCreate.";
  diagnostics.error(
    "unknown-event",
    `"${name}" isn't a discord.js event. ${hint} Rename the directory.`,
    { file: route.file, route: route.id },
  );
  return null;
}

function validateEventMeta(
  value: unknown,
  route: Route,
  diagnostics: Diagnostics,
): EventMeta | null {
  if (value === undefined) return {};
  const fail = (message: string) => {
    diagnostics.error("invalid-meta", message, { file: route.file, route: route.id });
    return null;
  };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("meta has to be an object, like { order: 1 }.");
  }
  const meta = value as Record<string, unknown>;
  if (meta.once !== undefined && typeof meta.once !== "boolean") {
    return fail("meta.once has to be true or false.");
  }
  if (
    meta.order !== undefined &&
    (typeof meta.order !== "number" || !Number.isFinite(meta.order))
  ) {
    return fail(`meta.order is ${String(meta.order)}. Use a finite number.`);
  }
  if (meta.mode !== undefined && meta.mode !== "sequential" && meta.mode !== "concurrent") {
    return fail(`meta.mode is ${JSON.stringify(meta.mode)}. Use "sequential" or "concurrent".`);
  }
  return meta as EventMeta;
}

/** Case-insensitive match against known events, to catch `GuildMemberAdd` or `guildmemberadd`. */
function closest(name: string): string | null {
  const lower = name.toLowerCase();
  for (const known of EVENT_NAMES) if (known.toLowerCase() === lower) return known;
  return null;
}
