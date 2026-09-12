import type { ClientOptions, Interaction } from "discord.js";
import type { RouteCategory } from "../compiler/routes.js";
import type { NectarPlugin } from "../plugins/index.js";
import type { LogFields, LoggerOptions } from "./logger.js";
import type { Signal } from "./signals.js";

export type Env = "development" | "test" | "production";

/** The subset of `nectar.config.ts` the runtime reads. */
export interface RuntimeConfig {
  intents: ClientOptions["intents"];
  partials?: ClientOptions["partials"];
  /** Passed through to the discord.js `Client`. `intents` and `partials` above win. */
  client?: Partial<ClientOptions>;
  /** Import every handler at startup instead of on first use. Defaults to `true` in production. */
  eager?: boolean;
  /** Level and sink for framework logs. */
  logger?: LoggerOptions;
  /** Receives every framework signal: interactions, failures, gateway state, shutdown. */
  observe?: (signal: Signal) => void;
  /** Started before login, stopped on shutdown. Their services land on `services()`. */
  plugins?: NectarPlugin[];
}

export interface RouteInfo {
  id: string;
  category: RouteCategory;
  path: string;
  /** Absolute path of the handler file. */
  file: string;
}

export interface Trace {
  /** The interaction ID. */
  id: string;
  /** When the runtime received the interaction, epoch milliseconds. */
  receivedAt: number;
  /** Milliseconds since Discord created the interaction. Replies must land within 3000. */
  elapsed(): number;
}

export type Params = Record<string, string | string[]>;

/** Command option values by name. Untyped until the route is known. */
export type Options = Record<string, unknown>;

/** Returned from a middleware to end the chain. Reply to the interaction first. */
export const stop: unique symbol = Symbol.for("nectar.stop");
export type Stop = typeof stop;

declare const provides: unique symbol;

/**
 * A middleware: runs before the handlers below it with the interaction, and either returns a
 * value for `use()`, or `stop` to end the chain. `T` is what `use()` gives back.
 */
export type Middleware<T = unknown> = ((interaction: Interaction) => unknown) & {
  readonly [provides]?: T;
};

export type CommandHandler = (interaction: Interaction, options: Options) => unknown;
export type ComponentHandler = (interaction: Interaction, params: Params) => unknown;
export type AutocompleteHandler = (interaction: Interaction) => unknown;
export type EventHandler = (...args: unknown[]) => unknown;

/**
 * Return `"unhandled"` or throw to pass the error to the next boundary up. Returning anything
 * else marks it handled. `interaction` is `null` when an event handler threw.
 */
export type ErrorHandler = (
  error: unknown,
  interaction: Interaction | null,
) => unknown | Promise<unknown>;

/**
 * Framework logger. `fields` is structured metadata for the sink: route identity, trace, guild,
 * user, and so on. The thrown value goes under `error`.
 */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}
