import path from "node:path";
import type { Client } from "discord.js";
import type { NectarServices } from "../index.js";
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
  /** Filled by plugin `start` hooks. */
  services: NectarServices;
}

export function absolute(state: RuntimeState, file: string): string {
  return path.join(state.appDir, ...file.split("/"));
}

export function routeInfo(state: RuntimeState, route: ManifestRoute): RouteInfo {
  return {
    id: route.id,
    category: route.category,
    path: route.path,
    file: paths(state, route).file,
  };
}

export function chains(state: RuntimeState, route: ManifestRoute) {
  return paths(state, route);
}

interface RoutePaths {
  appDir: string;
  file: string;
  middleware: string[];
  errors: string[];
}

/** A route's absolute paths, joined on its first interaction instead of every one. */
const resolved = new WeakMap<ManifestRoute, RoutePaths>();

function paths(state: RuntimeState, route: ManifestRoute): RoutePaths {
  let found = resolved.get(route);
  if (found === undefined || found.appDir !== state.appDir) {
    found = {
      appDir: state.appDir,
      file: absolute(state, route.file),
      middleware: route.middleware.map((f) => absolute(state, f)),
      errors: route.errors.map((f) => absolute(state, f)),
    };
    resolved.set(route, found);
  }
  return found;
}
