import type { ManifestEvent, ManifestEventRoute } from "../manifest/schema.js";
import { handleError } from "./errors.js";
import { runInScope, type Scope } from "./scope.js";
import { chains, type RuntimeState, routeInfo } from "./state.js";
import type { EventHandler } from "./types.js";

export interface EventBinding {
  name: string;
  /** Resolves once every handler it fanned out to has finished. */
  listener: (...args: unknown[]) => Promise<void>;
}

/**
 * One discord.js listener per event. It fans out to the compiled handlers in manifest order,
 * sequentially or concurrently as the event's mode says. A `once` handler runs on the first
 * emission only; when every handler of an event is spent, the listener is removed.
 *
 * Handler errors go to the route's boundaries and never reach the client's `error` event.
 * Returns the bindings so the runtime can remove them on shutdown.
 */
export function bindEvents(state: RuntimeState): EventBinding[] {
  const routes = new Map<string, ManifestEventRoute>();
  for (const route of state.manifest.routes) {
    if (route.kind === "event") routes.set(route.id, route);
  }

  const bindings: EventBinding[] = [];
  for (const event of state.manifest.events) {
    const handlers = event.handlers
      .map((id) => routes.get(id))
      .filter((r): r is ManifestEventRoute => r !== undefined);
    if (handlers.length === 0) continue;

    const spent = new Set<string>();
    const listener = (...args: unknown[]) => {
      const live = handlers.filter((h) => !spent.has(h.id));
      for (const h of live) if (h.once) spent.add(h.id);
      if (spent.size === handlers.length) state.client.off(event.name, listener);
      return fanOut(state, event, live, args);
    };

    state.client.on(event.name, listener);
    bindings.push({ name: event.name, listener });
  }
  return bindings;
}

async function fanOut(
  state: RuntimeState,
  event: ManifestEvent,
  handlers: ManifestEventRoute[],
  args: unknown[],
): Promise<void> {
  if (event.mode === "concurrent") {
    await Promise.all(handlers.map((route) => invoke(state, event, route, args)));
    return;
  }
  for (const route of handlers) await invoke(state, event, route, args);
}

async function invoke(
  state: RuntimeState,
  event: ManifestEvent,
  route: ManifestEventRoute,
  args: unknown[],
) {
  const scope: Scope = {
    interaction: null,
    client: state.client,
    env: state.env,
    services: state.services,
    route: routeInfo(state, route),
    trace: null,
    results: new Map(),
  };
  await runInScope(scope, async () => {
    try {
      const handler = await state.modules.loadDefault<EventHandler>(
        scope.route.file,
        "The handler",
      );
      await handler(...args);
    } catch (error) {
      const boundary = await handleError(
        error,
        scope,
        chains(state, route).errors,
        state.modules,
        state.logger,
      );
      state.signals.emit({
        type: "event:fail",
        event: event.name,
        route: scope.route,
        error,
        boundary,
      });
    }
  });
}
