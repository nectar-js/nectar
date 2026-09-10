import type { Client } from "discord.js";
import type { Project } from "../cli/project.js";
import type { Severity } from "../compiler/diagnostics.js";
import type { RouteKind } from "../compiler/routes.js";
import type { NectarServices } from "../index.js";
import type {
  Manifest,
  ManifestCommand,
  ManifestEvent,
  ManifestRoute,
} from "../manifest/schema.js";
import type { SignalEmitter } from "../runtime/signals.js";
import type { Env, Logger } from "../runtime/types.js";

/**
 * A plugin takes part in compilation and the runtime lifecycle. A library that only exports
 * functions for handlers to call does not need to be one.
 */
export interface NectarPlugin {
  /** Unique among the configured plugins. Named in diagnostics and in the manifest. */
  name: string;
  version?: string;
  /**
   * Runs after the route graph is validated and before the manifest is written. The graph is
   * frozen; return changes and the compiler applies and checks them. Plugins run in config
   * order, each seeing the changes of the ones before it.
   */
  transform?(graph: PluginGraph): Maybe<PluginChange[]> | Promise<Maybe<PluginChange[]>>;
  /** Declarations appended to `.nectar/types.d.ts`. */
  types?(graph: PluginGraph): Maybe<string>;
  /** Extra `nectar <name>` commands. */
  commands?: PluginCommand[];
  /**
   * Runs once when the runtime starts, before any handler is imported and before login.
   * Returned services land on `ctx.services` for every handler and middleware.
   */
  start?(app: PluginApp): Maybe<Partial<NectarServices>> | Promise<Maybe<Partial<NectarServices>>>;
  /** Runs on shutdown, after in-flight interactions drain and before the client is destroyed. */
  stop?(app: PluginApp): void | Promise<void>;
}

/** A hook may return nothing, so a body without `return` type-checks. */
// biome-ignore lint/suspicious/noConfusingVoidType: that is the point
type Maybe<T> = T | undefined | void;

export type PluginChange =
  | {
      type: "middleware";
      /** Route ID, `<category>:<path>`. */
      route: string;
      /**
       * Only the route of this kind. A command and its autocomplete share an ID; without
       * `kind`, both get the middleware, as they would from a `middleware.ts`.
       */
      kind?: RouteKind;
      /** Absolute path of a module whose default export is a middleware. */
      file: string;
      /** `outer` (default) runs before the app's own middleware, `inner` right before the handler. */
      position?: "outer" | "inner";
    }
  | {
      type: "diagnostic";
      severity: Severity;
      code: string;
      message: string;
      file?: string;
      route?: string;
    };

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** The compiled app as a plugin sees it: the manifest shape with absolute file paths, frozen. */
export interface PluginGraph {
  readonly appDir: string;
  readonly routes: DeepReadonly<ManifestRoute[]>;
  readonly commands: DeepReadonly<ManifestCommand[]>;
  readonly events: DeepReadonly<ManifestEvent[]>;
}

export interface PluginApp {
  readonly client: Client;
  readonly env: Env;
  readonly logger: Logger;
  readonly signals: SignalEmitter;
  readonly manifest: Manifest;
}

export interface PluginCommand {
  name: string;
  description: string;
  options?: Record<string, { type: "boolean" | "string"; description: string }>;
  /** Returns the exit code. */
  run(ctx: PluginCommandContext): number | Promise<number>;
}

export interface PluginCommandContext {
  project: Project;
  flags: Record<string, string | boolean | undefined>;
  out(line: string): void;
  err(line: string): void;
}

export function definePlugin(plugin: NectarPlugin): NectarPlugin {
  return plugin;
}

/** A plugin misbehaved: threw from a hook, or provided something that clashes. */
export class PluginError extends Error {
  constructor(
    readonly plugin: string,
    readonly detail: string,
  ) {
    super(`Plugin "${plugin}": ${detail}`);
    this.name = "PluginError";
  }
}

export { applyPlugins, pluginGraph } from "./transform.js";
