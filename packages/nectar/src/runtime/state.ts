import path from "node:path";
import type { Client } from "discord.js";
import type { Manifest, ManifestRoute } from "../manifest/schema.js";
import type { ModuleRegistry } from "./modules.js";
import type { SignalEmitter } from "./signals.js";
import type { Env, Logger, RouteInfo } from "./types.js";

/** Everything dispatch needs, shared by interactions and events. */
export interface RuntimeState {
  manifest: Manifest;
  /** Absolute. */
  appDir: string;
  client: Client;
  modules: ModuleRegistry;
  env: Env;
  logger: Logger;
  signals: SignalEmitter;
}

export function absolute(state: RuntimeState, file: string): string {
  return path.join(state.appDir, ...file.split("/"));
}

export function routeInfo(state: RuntimeState, route: ManifestRoute): RouteInfo {
  return {
    id: route.id,
    category: route.category,
    path: route.path,
    file: absolute(state, route.file),
  };
}

export function chains(state: RuntimeState, route: ManifestRoute) {
  return {
    middleware: route.middleware.map((f) => absolute(state, f)),
    errors: route.errors.map((f) => absolute(state, f)),
  };
}
