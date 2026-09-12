import { AsyncLocalStorage } from "node:async_hooks";
import type { Client, Interaction } from "discord.js";
import type { NectarServices } from "../index.js";
import type { Env, Middleware, RouteInfo, Trace } from "./types.js";

/**
 * What the runtime knows while it runs one route: the interaction, the bot, and what each
 * middleware returned. Handlers reach it through `client()`, `use()`, and the other accessors,
 * which read it from async context, so it never has to be passed around.
 */
export interface Scope {
  /** `null` for event handlers. */
  interaction: Interaction | null;
  client: Client;
  env: Env;
  services: NectarServices;
  route: RouteInfo;
  /** `null` for event handlers. */
  trace: Trace | null;
  /** What each middleware returned, for `use()`. */
  results: Map<Middleware, unknown>;
}

const storage = new AsyncLocalStorage<Scope>();

export function runInScope<T>(scope: Scope, fn: () => Promise<T>): Promise<T> {
  return storage.run(scope, fn);
}

export function currentScope(caller: string): Scope {
  const scope = storage.getStore();
  if (scope === undefined) {
    throw new Error(
      `${caller}() was called outside a route. It only works while Nectar runs a handler, middleware, or error boundary, not at the top level of a module.`,
    );
  }
  return scope;
}

/** The discord.js client. */
export function client(): Client {
  return currentScope("client").client;
}

/** `"development"`, `"test"`, or `"production"`. */
export function env(): Env {
  return currentScope("env").env;
}

/** What plugin `start` hooks provided. Empty without plugins. */
export function services(): NectarServices {
  return currentScope("services").services;
}

/** The route being run: `id`, `category`, `path`, and `file`. */
export function route(): RouteInfo {
  return currentScope("route").route;
}

/** The interaction's trace: its ID, when it arrived, and the milliseconds since Discord created it. */
export function trace(): Trace {
  const scope = currentScope("trace");
  if (scope.trace === null) {
    throw new Error(
      "trace() has nothing to report in an event handler. Only interactions are traced.",
    );
  }
  return scope.trace;
}

/**
 * What a middleware returned for the current interaction. The middleware has to be one that
 * ran for this route: a `middleware.ts` above it, or one a plugin added.
 */
export function use<T>(middleware: Middleware<T>): T {
  const scope = currentScope("use");
  if (!scope.results.has(middleware)) {
    throw new Error(
      `use() was given a middleware that did not run for ${scope.route.id}. Only middleware above the route in app/, or middleware a plugin added to it, can be used.`,
    );
  }
  return scope.results.get(middleware) as T;
}
