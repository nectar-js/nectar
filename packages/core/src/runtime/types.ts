import type {
  AnySelectMenuInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ClientOptions,
  ContextMenuCommandInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import type { RouteCategory } from "../compiler/routes.js";

export type Env = "development" | "test" | "production";

/** The subset of `neat.config.ts` the runtime reads. */
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

export interface InteractionContext<Interaction = unknown> {
  interaction: Interaction;
  client: Client;
  route: RouteInfo;
  params: Record<string, string | string[]>;
  env: Env;
  trace: Trace;
}

export type CommandContext = InteractionContext<ChatInputCommandInteraction>;
export type ContextMenuContext = InteractionContext<ContextMenuCommandInteraction>;
export type ButtonContext = InteractionContext<ButtonInteraction>;
export type SelectContext = InteractionContext<AnySelectMenuInteraction>;
export type ModalContext = InteractionContext<ModalSubmitInteraction>;
export type AutocompleteContext = InteractionContext<AutocompleteInteraction>;

export interface EventContext {
  client: Client;
  route: RouteInfo;
  env: Env;
}

/** What a middleware's `next()` accepts: extra fields merged into the downstream context. */
export type ContextExtension = Record<string, unknown>;

export type Next = (extension?: ContextExtension) => Promise<unknown>;

export type Middleware = (ctx: InteractionContext, next: Next) => unknown;

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
