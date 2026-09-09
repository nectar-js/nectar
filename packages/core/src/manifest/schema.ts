import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import type { RouteCategory } from "../compiler/routes.js";
import type { SelectKind } from "../components/compile.js";
import type { EventMode } from "../events/compile.js";

export const MANIFEST_VERSION = 1;

/**
 * The compiled app, as written to `.neat/manifest.json`.
 *
 * Every file path is relative to `appDir`, with `/` separators, so a manifest built on one
 * machine loads on another. `appDir` itself is relative to the manifest's own directory.
 */
export interface Manifest {
  version: typeof MANIFEST_VERSION;
  /** `@neatjs/core` version that produced this manifest. */
  neat: string;
  appDir: string;
  routes: ManifestRoute[];
  commands: ManifestCommand[];
  events: ManifestEvent[];
}

interface ManifestRouteBase {
  /** Canonical identity, `<category>:<path>`. Unique together with `kind`. */
  id: string;
  category: RouteCategory;
  path: string;
  file: string;
  /** Middleware files in execution order, root first. */
  middleware: string[];
  /** Error boundary files, nearest first. */
  errors: string[];
}

export interface ManifestCommandRoute extends ManifestRouteBase {
  kind: "command";
}

export interface ManifestAutocompleteRoute extends ManifestRouteBase {
  kind: "autocomplete";
  /** Option names handled, each a named export of the file. */
  options: string[];
}

export interface ManifestComponentRoute extends ManifestRouteBase {
  kind: "button" | "select" | "modal";
  shortId: string;
  params: string[];
  catchAll: string | null;
  selectKind: SelectKind | null;
  overhead: number;
}

export interface ManifestEventRoute extends ManifestRouteBase {
  kind: "event";
  event: string;
  once: boolean;
  order: number;
}

export type ManifestRoute =
  | ManifestCommandRoute
  | ManifestAutocompleteRoute
  | ManifestComponentRoute
  | ManifestEventRoute;

export interface ManifestCommand {
  name: string;
  type: number;
  payload: RESTPostAPIApplicationCommandsJSONBody;
  /** Handler position (`""`, `"sub"`, or `"group/sub"`) to command route ID. */
  handlers: Record<string, string>;
}

export interface ManifestEvent {
  name: string;
  mode: EventMode;
  /** Event route IDs in execution order. */
  handlers: string[];
}
