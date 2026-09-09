import type { ClientOptions } from "discord.js";
import type { Env } from "./runtime/types.js";

/** `nect.config.ts`: `export default defineConfig({ ... })`. */
export interface NectConfig {
  intents: ClientOptions["intents"];
  partials?: ClientOptions["partials"];
  /** Extra discord.js client options. `intents` and `partials` above take precedence. */
  client?: Partial<ClientOptions>;
  /** Import every handler at startup. Defaults to `true` in production, `false` otherwise. */
  eager?: boolean;
  /** Overrides `NODE_ENV`. */
  env?: Env;
  /** Route directory, relative to the project root. Defaults to `app`. */
  appDir?: string;
  /** Build output, relative to the project root. Defaults to `.nect`. */
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
}

export function defineConfig(config: NectConfig): NectConfig {
  return config;
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

/** Checks a loaded config's shape. Discord validates intent and partial values itself at login. */
export function validateConfig(value: unknown, file: string): NectConfig {
  const fail = (detail: string): never => {
    throw new ConfigError(file, detail);
  };
  if (!isRecord(value)) fail("the default export must be an object. Use defineConfig({ ... }).");
  const config = value as Record<string, unknown>;

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
  return config as unknown as NectConfig;
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
