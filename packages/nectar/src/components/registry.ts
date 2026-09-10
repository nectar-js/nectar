import { type ComponentParams, customIdFor, type EncodableRoute } from "./compile.js";

export interface RegisteredComponentRoute extends EncodableRoute {
  path: string;
}

/**
 * Component routes the running app knows about, keyed by path. The runtime fills this from
 * the manifest before any handler runs, so `customId()` never needs the manifest itself.
 */
const routes = new Map<string, RegisteredComponentRoute>();

export function registerComponentRoutes(list: Iterable<RegisteredComponentRoute>): void {
  routes.clear();
  for (const route of list) routes.set(route.path, route);
}

export function encodeComponentRoute(path: string, params: ComponentParams): string {
  const route = routes.get(path);
  if (route === undefined) {
    throw new Error(
      routes.size === 0
        ? `customId("${path}") was called before the runtime registered any routes. Call it from a handler, or from code that runs after start().`
        : `No component route "${path}". Check the directory name under components/.`,
    );
  }
  return customIdFor(route, params);
}
