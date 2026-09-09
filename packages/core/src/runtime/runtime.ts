import path from "node:path";
import { Client, Events } from "discord.js";
import type { Manifest } from "../manifest/schema.js";
import { createInteractionDispatcher } from "./dispatch.js";
import { bindEvents, type EventBinding } from "./events.js";
import { ModuleRegistry } from "./modules.js";
import type { RuntimeState } from "./state.js";
import type { Env, Logger, RuntimeConfig } from "./types.js";

export interface RuntimeOptions {
  manifest: Manifest;
  /** Absolute path of the app directory the manifest was compiled from. */
  appDir: string;
  config: RuntimeConfig;
  /** Defaults from `NODE_ENV`. */
  env?: Env;
  logger?: Logger;
  /** Reuse an existing client instead of building one from `config`. Tests use this. */
  client?: Client;
}

export interface StartOptions {
  token: string;
  /** Stop on SIGINT and SIGTERM. Defaults to `true`. */
  signals?: boolean;
  /** How long `stop()` waits for in-flight interactions, in milliseconds. Defaults to 10000. */
  drainTimeout?: number;
}

export interface Runtime {
  readonly client: Client;
  readonly env: Env;
  /** Loads handlers, attaches listeners, and logs in. */
  start(options: StartOptions): Promise<void>;
  /**
   * Stops taking interactions, waits for the in-flight ones, detaches listeners, and
   * destroys the client. Safe to call twice.
   */
  stop(): Promise<void>;
}

export function createRuntime(options: RuntimeOptions): Runtime {
  const env = options.env ?? envFromProcess();
  const logger = options.logger ?? console;
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
  };

  const dispatch = createInteractionDispatcher(state);
  const inFlight = new Set<Promise<void>>();
  let bindings: EventBinding[] = [];
  let drainTimeout = 10_000;
  let stopping: Promise<void> | null = null;
  let onSignal: (() => void) | null = null;

  const onInteraction = (interaction: Parameters<typeof dispatch>[0]) => {
    const task = dispatch(interaction).finally(() => inFlight.delete(task));
    inFlight.add(task);
  };

  return {
    client,
    env,

    async start({ token, signals = true, drainTimeout: timeout = 10_000 }) {
      drainTimeout = timeout;
      if (options.config.eager ?? env === "production") {
        await state.modules.preload(everyFile(state));
      }

      bindings = bindEvents(state);
      client.on(Events.InteractionCreate, onInteraction);

      if (signals) {
        onSignal = () => {
          if (stopping !== null) {
            logger.warn("Second signal received, exiting now.");
            process.exit(1);
          }
          void this.stop();
        };
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);
      }

      await client.login(token);
    },

    stop() {
      if (stopping !== null) return stopping;
      stopping = (async () => {
        client.off(Events.InteractionCreate, onInteraction);
        for (const { name, listener } of bindings) client.off(name, listener);
        bindings = [];
        if (onSignal !== null) {
          process.off("SIGINT", onSignal);
          process.off("SIGTERM", onSignal);
          onSignal = null;
        }
        await drain(inFlight, drainTimeout, logger);
        await client.destroy();
      })();
      return stopping;
    },
  };
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

function everyFile(state: RuntimeState): Set<string> {
  const files = new Set<string>();
  for (const route of state.manifest.routes) {
    files.add(route.file);
    for (const file of route.middleware) files.add(file);
    for (const file of route.errors) files.add(file);
  }
  return new Set([...files].map((file) => path.join(state.appDir, ...file.split("/"))));
}

function envFromProcess(): Env {
  const value = process.env.NODE_ENV;
  return value === "production" || value === "test" ? value : "development";
}
