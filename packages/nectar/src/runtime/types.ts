import type { Client, ClientOptions, Interaction } from "discord.js";
import type { RouteCategory } from "../compiler/routes.js";
import type { NectarServices } from "../index.js";
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
  /** Started before login, stopped on shutdown. Their services land on `ctx.services`. */
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

export interface InteractionContext<I = Interaction, P = Params> {
  interaction: I;
  client: Client;
  route: RouteInfo;
  params: P;
  env: Env;
  trace: Trace;
  /** What plugins provide. Empty without plugins. */
  services: NectarServices;
}

export interface EventContext {
  client: Client;
  route: RouteInfo;
  env: Env;
  services: NectarServices;
}

/** What a middleware's `next()` accepts: extra fields merged into the downstream context. */
export type ContextExtension = Record<string, unknown>;

declare const extension: unique symbol;

/** Carries the extension type through `next()`'s return value so `defineMiddleware` can infer it. */
export interface Extended<E extends ContextExtension> {
  readonly [extension]?: E;
}

export type Next = <E extends ContextExtension = Record<never, never>>(
  extension?: E,
) => Promise<Extended<E>>;

export type Middleware<E extends ContextExtension = ContextExtension> = ((
  ctx: InteractionContext,
  next: Next,
) => unknown) &
  Extended<E>;

/** The context fields a middleware module adds downstream. `{}` for plain functions. */
export type MiddlewareExtension<M> = M extends { default: Extended<infer E> }
  ? ContextExtension extends E
    ? Record<never, never>
    : E
  : Record<never, never>;

export type Handler = (ctx: InteractionContext) => unknown;

export type EventHandler = (...args: unknown[]) => unknown;

/**
 * Return `"unhandled"` or throw to pass the error to the next boundary up. Returning anything
 * else marks it handled.
 */
export type ErrorHandler = (
  error: unknown,
  ctx: InteractionContext | EventContext,
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
