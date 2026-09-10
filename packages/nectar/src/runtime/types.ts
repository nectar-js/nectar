import type { Client, ClientOptions, Interaction } from "discord.js";
import type { RouteCategory } from "../compiler/routes.js";

export type Env = "development" | "test" | "production";

/** The subset of `nectar.config.ts` the runtime reads. */
export interface RuntimeConfig {
  intents: ClientOptions["intents"];
  partials?: ClientOptions["partials"];
  /** Passed through to the discord.js `Client`. `intents` and `partials` above win. */
  client?: Partial<ClientOptions>;
  /** Import every handler at startup instead of on first use. Defaults to `true` in production. */
  eager?: boolean;
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
}

export interface EventContext {
  client: Client;
  route: RouteInfo;
  env: Env;
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

export interface Logger {
  error(message: string, error?: unknown): void;
  warn(message: string): void;
}
