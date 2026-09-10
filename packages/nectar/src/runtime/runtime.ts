import path from "node:path";
import { Client, DiscordjsError, DiscordjsErrorCodes, Events } from "discord.js";
import { registerComponentRoutes } from "../components/registry.js";
import type { Manifest, ManifestComponentRoute } from "../manifest/schema.js";
import { type NectarPlugin, type PluginApp, PluginError } from "../plugins/index.js";
import { createInteractionDispatcher } from "./dispatch.js";
import { bindEvents, type EventBinding } from "./events.js";
import { createLogger } from "./logger.js";
import { ModuleRegistry } from "./modules.js";
import { createSignals, type SignalEmitter } from "./signals.js";
import type { RuntimeState } from "./state.js";
import type { Env, Logger, RuntimeConfig } from "./types.js";

export interface RuntimeOptions {
  manifest: Manifest;
  /** Absolute path of the app directory the manifest was compiled from. */
  appDir: string;
  config: RuntimeConfig;
  /** Defaults from `NODE_ENV`. */
  env?: Env;
  /** Overrides `config.logger`. */
  logger?: Logger;
  /** Share an emitter created earlier, so signals from before the runtime existed line up. */
  signals?: SignalEmitter;
  /** Reuse an existing client instead of building one from `config`. Tests use this. */
  client?: Client;
}

/** `client.login` failed: Discord refused the token, or could not be reached. */
export class LoginError extends Error {
  readonly invalidToken: boolean;

  constructor(cause: unknown) {
    const invalidToken =
      cause instanceof DiscordjsError && cause.code === DiscordjsErrorCodes.TokenInvalid;
    super(
      invalidToken ? "Discord rejected the bot token." : `Could not log in: ${describe(cause)}`,
      { cause },
    );
    this.name = "LoginError";
    this.invalidToken = invalidToken;
  }
}

export interface StartOptions {
  token: string;
  /**
   * Stop on SIGINT and SIGTERM, and when the IPC channel to a parent process closes, so a shard
   * does not outlive the manager that spawned it. Defaults to `true`.
   */
  signals?: boolean;
  /** How long `stop()` waits for in-flight interactions, in milliseconds. Defaults to 10000. */
  drainTimeout?: number;
}

export interface Runtime {
  readonly client: Client;
  readonly env: Env;
  readonly modules: ModuleRegistry;
  /** Framework signals. `config.observe` is subscribed already. */
  readonly signals: SignalEmitter;
  /** Loads handlers, attaches listeners, and logs in. A failed login stops it and throws `LoginError`. */
  start(options: StartOptions): Promise<void>;
  /**
   * Stops taking interactions, waits for the in-flight ones, detaches listeners, and
   * destroys the client. Safe to call twice.
   */
  stop(): Promise<void>;
  /**
   * Swaps in a recompiled manifest: dispatch tables, component routes, and event listeners
   * follow it. Handler modules are not touched; invalidate them through `modules`.
   */
  update(manifest: Manifest): void;
}

export function createRuntime(options: RuntimeOptions): Runtime {
  const env = options.env ?? envFromProcess();
  const logger = options.logger ?? createLogger(options.config.logger);
  const signals = options.signals ?? createSignals(logger);
  if (options.config.observe !== undefined) signals.on(options.config.observe);
  const client =
    options.client ??
    new Client({
      ...options.config.client,
      intents: options.config.intents,
      ...(options.config.partials === undefined ? {} : { partials: options.config.partials }),
    });

  const state: RuntimeState = {
    manifest: options.manifest,
    appDir: path.resolve(options.appDir),
    client,
    modules: new ModuleRegistry(),
    env,
    logger,
    signals,
    services: {},
  };
  const plugins = options.config.plugins ?? [];
  const app: PluginApp = {
    client,
    env,
    logger,
    signals,
    get manifest() {
      return state.manifest;
    },
  };

  registerComponentRoutes(componentRoutes(state.manifest));
  let dispatch = createInteractionDispatcher(state);
  const inFlight = new Set<Promise<void>>();
  let bindings: EventBinding[] = [];
  let started = false;
  let globalStarted = false;
  let drainTimeout = 10_000;
  let stopping: Promise<void> | null = null;
  let onSignal: (() => void) | null = null;

  const onInteraction = (interaction: Parameters<typeof dispatch>[0]) => {
    const task = dispatch(interaction).finally(() => inFlight.delete(task));
    inFlight.add(task);
  };
  const gateway = {
    [Events.ShardReady]: (shard: number) =>
      signals.emit({ type: "gateway:connect", shard, resumed: false }),
    [Events.ShardResume]: (shard: number) =>
      signals.emit({ type: "gateway:connect", shard, resumed: true }),
    [Events.ShardDisconnect]: (event: { code: number }, shard: number) =>
      signals.emit({ type: "gateway:disconnect", shard, code: event.code }),
  };

  return {
    client,
    env,
    modules: state.modules,
    signals,

    async start({ token, signals: osSignals = true, drainTimeout: timeout = 10_000 }) {
      drainTimeout = timeout;
      await startPlugins(plugins, app, state.services as Record<string, unknown>);
      if (runsShardZero(client.options.shards)) {
        await startGlobal(plugins, app);
        globalStarted = true;
      }
      if (options.config.eager ?? env === "production") {
        await state.modules.preload(manifestFiles(state.manifest, state.appDir));
      }

      bindings = bindEvents(state);
      started = true;
      client.on(Events.InteractionCreate, onInteraction);
      client.on(Events.ShardReady, gateway[Events.ShardReady]);
      client.on(Events.ShardResume, gateway[Events.ShardResume]);
      client.on(Events.ShardDisconnect, gateway[Events.ShardDisconnect]);

      if (osSignals) {
        onSignal = () => {
          if (stopping !== null) {
            logger.warn("Second signal received, exiting now.");
            process.exit(1);
          }
          void this.stop();
        };
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);
        if (process.connected) process.once("disconnect", onSignal);
      }

      try {
        await client.login(token);
      } catch (error) {
        await this.stop();
        throw new LoginError(error);
      }
    },

    stop() {
      if (stopping !== null) return stopping;
      stopping = (async () => {
        signals.emit({ type: "shutdown" });
        client.off(Events.InteractionCreate, onInteraction);
        client.off(Events.ShardReady, gateway[Events.ShardReady]);
        client.off(Events.ShardResume, gateway[Events.ShardResume]);
        client.off(Events.ShardDisconnect, gateway[Events.ShardDisconnect]);
        for (const { name, listener } of bindings) client.off(name, listener);
        bindings = [];
        if (onSignal !== null) {
          process.off("SIGINT", onSignal);
          process.off("SIGTERM", onSignal);
          process.off("disconnect", onSignal);
          onSignal = null;
        }
        await drain(inFlight, drainTimeout, logger);
        if (globalStarted) await stopPlugins(plugins, app, logger, "stopGlobal");
        await stopPlugins(plugins, app, logger, "stop");
        await client.destroy();
      })();
      return stopping;
    },

    update(manifest) {
      state.manifest = manifest;
      registerComponentRoutes(componentRoutes(manifest));
      dispatch = createInteractionDispatcher(state);
      if (started && stopping === null) {
        for (const { name, listener } of bindings) client.off(name, listener);
        bindings = bindEvents(state);
      }
    },
  };
}

/** Runs `start` hooks in config order. Two plugins offering the same service is a startup failure. */
async function startPlugins(
  plugins: readonly NectarPlugin[],
  app: PluginApp,
  services: Record<string, unknown>,
): Promise<void> {
  const providers = new Map<string, string>();
  for (const plugin of plugins) {
    let provided: unknown;
    try {
      provided = await plugin.start?.(app);
    } catch (error) {
      throw new PluginError(plugin.name, `start failed: ${describe(error)}`);
    }
    if (provided === undefined || provided === null) continue;
    if (typeof provided !== "object") {
      throw new PluginError(plugin.name, `start must return an object of services or nothing.`);
    }
    for (const [name, service] of Object.entries(provided)) {
      const owner = providers.get(name);
      if (owner !== undefined) {
        throw new PluginError(
          plugin.name,
          `provides service "${name}", which plugin "${owner}" already provides.`,
        );
      }
      providers.set(name, plugin.name);
      services[name] = service;
    }
  }
}

/** Runs `startGlobal` hooks in config order. */
async function startGlobal(plugins: readonly NectarPlugin[], app: PluginApp): Promise<void> {
  for (const plugin of plugins) {
    try {
      await plugin.startGlobal?.(app);
    } catch (error) {
      throw new PluginError(plugin.name, `startGlobal failed: ${describe(error)}`);
    }
  }
}

/** Runs `stopGlobal` or `stop` hooks in reverse order. A failing hook is logged; shutdown continues. */
async function stopPlugins(
  plugins: readonly NectarPlugin[],
  app: PluginApp,
  logger: Logger,
  hook: "stop" | "stopGlobal",
): Promise<void> {
  for (const plugin of [...plugins].reverse()) {
    try {
      await plugin[hook]?.(app);
    } catch (error) {
      logger.error(`Plugin "${plugin.name}": ${hook} failed.`, { plugin: plugin.name, error });
    }
  }
}

/**
 * Whether this process runs shard 0. Application-global hooks run there, so they run once
 * however the shards are spread over processes. `auto` means this process runs them all.
 */
function runsShardZero(shards: Client["options"]["shards"]): boolean {
  if (shards === undefined || shards === "auto") return true;
  return typeof shards === "number" ? shards === 0 : shards.includes(0);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function drain(inFlight: Set<Promise<void>>, timeout: number, logger: Logger) {
  if (inFlight.size === 0) return;
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeout);
  });
  const result = await Promise.race([Promise.allSettled([...inFlight]), expired]);
  clearTimeout(timer);
  if (result === "timeout") {
    logger.warn(
      `${inFlight.size} interaction(s) still running after ${timeout}ms, shutting down anyway.`,
    );
  }
}

function componentRoutes(manifest: Manifest): ManifestComponentRoute[] {
  return manifest.routes.filter(
    (r): r is ManifestComponentRoute =>
      r.kind === "button" || r.kind === "select" || r.kind === "modal",
  );
}

/** Absolute paths of every handler, middleware, and error boundary file a manifest refers to. */
export function manifestFiles(manifest: Manifest, appDir: string): Set<string> {
  const files = new Set<string>();
  for (const route of manifest.routes) {
    files.add(route.file);
    for (const file of route.middleware) files.add(file);
    for (const file of route.errors) files.add(file);
  }
  return new Set([...files].map((file) => path.join(appDir, ...file.split("/"))));
}

function envFromProcess(): Env {
  const value = process.env.NODE_ENV;
  return value === "production" || value === "test" ? value : "development";
}
