import type { ClientOptions } from "discord.js";
import type { NectarPlugin } from "./plugins/index.js";
import type { LoggerOptions } from "./runtime/logger.js";
import type { Signal } from "./runtime/signals.js";
import type { Env } from "./runtime/types.js";

/** `nectar.config.ts`: `export default defineConfig({ ... })`. */
export interface NectarConfig {
  /**
   * Bot token. Usually `process.env.DISCORD_TOKEN`; the CLI falls back to that variable when
   * this is omitted or empty.
   */
  token?: string | undefined;
  /** Application ID, for command registration. Falls back to `DISCORD_APPLICATION_ID`. */
  applicationId?: string | undefined;
  intents: ClientOptions["intents"];
  partials?: ClientOptions["partials"];
  /** Extra discord.js client options. `intents` and `partials` above take precedence. */
  client?: Partial<ClientOptions>;
  /** Import every handler at startup. Defaults to `true` in production, `false` otherwise. */
  eager?: boolean;
  /** Overrides `NODE_ENV`. */
  env?: Env;
  /**
   * Framework log level and sink. The default sink prints to the console; pass `sink` to hand
   * records to your own logger. Handlers are free to log however they like.
   */
  logger?: LoggerOptions;
  /** Called with every framework signal: interaction lifecycle, failures, gateway state, shutdown. */
  observe?: (signal: Signal) => void;
  /** Plugins, in the order their hooks run. This is the only way to register one. */
  plugins?: NectarPlugin[];
  /** Route directory, relative to the project root. Defaults to `app`. */
  appDir?: string;
  /** Build output, relative to the project root. Defaults to `.nectar`. */
  outDir?: string;
  dev?: {
    /** Guilds that receive commands instantly while developing. */
    guilds?: string[];
  };
  commands?: {
    /**
     * Where commands are registered outside development: everywhere, or only in the listed
     * guilds. Defaults to `"global"`. Development always uses `dev.guilds`.
     */
    target?: "global" | string[];
  };
  /**
   * Overrides for one environment, applied once the environment is known. Each key replaces
   * the value above it; nested objects are not merged.
   */
  environments?: Partial<Record<Env, Partial<Omit<NectarConfig, "env" | "environments">>>>;
}

export function defineConfig(config: NectarConfig): NectarConfig {
  return config;
}

/** The config one environment runs with: `environments[env]` over the rest. */
export function configFor(config: NectarConfig, env: Env): NectarConfig {
  const { environments, ...base } = config;
  return { ...base, ...environments?.[env] };
}

export class ConfigError extends Error {
  constructor(
    readonly file: string,
    readonly detail: string,
  ) {
    super(`${file}: ${detail}`);
    this.name = "ConfigError";
  }
}

const ENVS = new Set<string>(["development", "test", "production"]);
const LEVELS = new Set<string>(["debug", "info", "warn", "error"]);

/** Checks a loaded config's shape. Discord validates intent and partial values itself at login. */
export function validateConfig(value: unknown, file: string): NectarConfig {
  const fail = (detail: string): never => {
    throw new ConfigError(file, detail);
  };
  if (!isRecord(value)) fail("the default export must be an object. Use defineConfig({ ... }).");
  const config = value as Record<string, unknown>;

  for (const key of ["token", "applicationId"] as const) {
    if (config[key] !== undefined && typeof config[key] !== "string") {
      fail(`\`${key}\` must be a string, usually read from process.env.`);
    }
  }
  if (config.intents === undefined) fail("`intents` is required. Use [] for none.");
  if (!isBitfield(config.intents)) {
    fail("`intents` must be an array of intent names or bits, a single bit, or a bigint.");
  }
  if (config.partials !== undefined && !Array.isArray(config.partials)) {
    fail("`partials` must be an array.");
  }
  if (config.client !== undefined && !isRecord(config.client)) fail("`client` must be an object.");
  if (config.eager !== undefined && typeof config.eager !== "boolean") {
    fail("`eager` must be a boolean.");
  }
  if (config.env !== undefined && (typeof config.env !== "string" || !ENVS.has(config.env))) {
    fail('`env` must be "development", "test", or "production".');
  }
  if (config.logger !== undefined) {
    if (!isRecord(config.logger)) fail("`logger` must be an object.");
    const { level, sink } = config.logger as Record<string, unknown>;
    if (level !== undefined && (typeof level !== "string" || !LEVELS.has(level))) {
      fail('`logger.level` must be "debug", "info", "warn", or "error".');
    }
    if (sink !== undefined && typeof sink !== "function") {
      fail("`logger.sink` must be a function that receives log records.");
    }
  }
  if (config.observe !== undefined && typeof config.observe !== "function") {
    fail("`observe` must be a function that receives signals.");
  }
  if (config.plugins !== undefined) validatePlugins(config.plugins, fail);
  for (const key of ["appDir", "outDir"] as const) {
    const dir = config[key];
    if (dir !== undefined && (typeof dir !== "string" || dir === "")) {
      fail(`\`${key}\` must be a non-empty string.`);
    }
  }
  if (config.dev !== undefined) {
    if (!isRecord(config.dev)) fail("`dev` must be an object.");
    const guilds = (config.dev as Record<string, unknown>).guilds;
    if (guilds !== undefined && !isGuildList(guilds)) {
      fail("`dev.guilds` must be an array of guild ID strings.");
    }
  }
  if (config.commands !== undefined) {
    if (!isRecord(config.commands)) fail("`commands` must be an object.");
    const target = (config.commands as Record<string, unknown>).target;
    if (target !== undefined && target !== "global" && !isGuildList(target)) {
      fail('`commands.target` must be "global" or an array of guild ID strings.');
    }
  }
  if (config.environments !== undefined) validateEnvironments(config, file, fail);
  return config as unknown as NectarConfig;
}

/** Each override must name an environment, and the config it produces must be valid. */
function validateEnvironments(
  config: Record<string, unknown>,
  file: string,
  fail: (detail: string) => never,
): void {
  if (!isRecord(config.environments)) fail("`environments` must be an object.");
  for (const [name, override] of Object.entries(config.environments as Record<string, unknown>)) {
    const where = `\`environments.${name}\``;
    if (!ENVS.has(name)) fail(`${where}: use "development", "test", or "production" as the key.`);
    if (!isRecord(override)) fail(`${where} must be an object.`);
    for (const key of ["env", "environments"]) {
      if (key in (override as Record<string, unknown>)) fail(`${where} cannot set \`${key}\`.`);
    }
    try {
      validateConfig(configFor(config as unknown as NectarConfig, name as Env), file);
    } catch (error) {
      if (error instanceof ConfigError) fail(`${where}: ${error.detail}`);
      throw error;
    }
  }
}

/** Names `nectar` already answers to. A plugin command cannot take one. */
const BUILTIN_COMMANDS = new Set([
  "dev",
  "build",
  "check",
  "routes",
  "manifest",
  "sync",
  "start",
  "clean",
  "info",
  "help",
]);

function validatePlugins(value: unknown, fail: (detail: string) => never): void {
  if (!Array.isArray(value)) fail("`plugins` must be an array of plugins.");
  const names = new Set<string>();
  const commands = new Map<string, string>();
  value.forEach((plugin: unknown, index) => {
    if (!isRecord(plugin) || typeof plugin.name !== "string" || plugin.name === "") {
      fail(
        `\`plugins[${index}]\` must be an object with a non-empty \`name\`. Use definePlugin({ ... }).`,
      );
    }
    const name = plugin.name as string;
    if (names.has(name)) fail(`Plugin "${name}" is listed twice.`);
    names.add(name);
    for (const hook of ["transform", "types", "start", "stop", "startGlobal", "stopGlobal"]) {
      if (plugin[hook] !== undefined && typeof plugin[hook] !== "function") {
        fail(`Plugin "${name}": \`${hook}\` must be a function.`);
      }
    }
    if (plugin.commands === undefined) return;
    if (!Array.isArray(plugin.commands)) fail(`Plugin "${name}": \`commands\` must be an array.`);
    for (const command of plugin.commands as unknown[]) {
      if (
        !isRecord(command) ||
        typeof command.name !== "string" ||
        !/^[a-z][a-z0-9-]*$/.test(command.name) ||
        typeof command.description !== "string" ||
        typeof command.run !== "function"
      ) {
        fail(
          `Plugin "${name}": every command needs a lowercase \`name\`, a \`description\`, and a \`run\` function.`,
        );
      }
      const commandName = command.name as string;
      if (BUILTIN_COMMANDS.has(commandName)) {
        fail(`Plugin "${name}": command "${commandName}" is built into nectar. Pick another name.`);
      }
      const owner = commands.get(commandName);
      if (owner !== undefined && owner !== name) {
        fail(`Plugins "${owner}" and "${name}" both define the command "${commandName}".`);
      }
      commands.set(commandName, name);
    }
  });
}

function isGuildList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((g) => typeof g === "string" && /^\d+$/.test(g));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBitfield(value: unknown): boolean {
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "string") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(
      (v) => typeof v === "number" || typeof v === "string" || typeof v === "bigint",
    );
  }
  return isRecord(value) && "bitfield" in value;
}
