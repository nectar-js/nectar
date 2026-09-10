import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  ClientEvents,
  MentionableSelectMenuInteraction,
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
  UserContextMenuCommandInteraction,
  UserSelectMenuInteraction,
} from "discord.js";
import type { CommandType, OptionType } from "./commands/meta.js";
import type { SelectKind } from "./components/compile.js";
import type { ParamValidator } from "./components/params.js";
import { encodeComponentRoute } from "./components/registry.js";
import type { NectarRoutes } from "./index.js";
import type {
  ContextExtension,
  ErrorHandler,
  EventContext,
  Extended,
  InteractionContext,
  Middleware,
  Next,
  Params,
} from "./runtime/types.js";

type Empty = Record<never, never>;

/** `NectarRoutes[K]` when the generated types declare it, otherwise `never`. */
type Declared<K extends string> = NectarRoutes extends Record<K, infer V> ? V : never;
type Fallback<T, F> = [T] extends [never] ? F : T;

export type ComponentKindName = "button" | "modal" | `select:${SelectKind}`;

export interface ComponentRouteType {
  kind: ComponentKindName;
  params: Params;
  context: object;
}

export interface CommandRouteType {
  type: CommandType;
  options: Record<string, OptionType>;
  context: object;
}

/** Component routes by path. Until types are generated, any string is accepted. */
export type ComponentRoutes = Fallback<
  Declared<"components">,
  Record<string, { kind: ComponentKindName; params: Params; context: Empty }>
>;

/** Command routes by path. Until types are generated, any string is accepted. */
export type CommandRoutes = Fallback<
  Declared<"commands">,
  Record<string, { type: CommandType; options: Record<string, OptionType>; context: Empty }>
>;

export type ComponentPath = keyof ComponentRoutes & string;
export type CommandPath = keyof CommandRoutes & string;

type Route<Routes, P extends string> = P extends keyof Routes ? Routes[P] : never;

type ComponentInteraction<K> = K extends "button"
  ? ButtonInteraction
  : K extends "modal"
    ? ModalSubmitInteraction
    : K extends "select:string"
      ? StringSelectMenuInteraction
      : K extends "select:user"
        ? UserSelectMenuInteraction
        : K extends "select:role"
          ? RoleSelectMenuInteraction
          : K extends "select:channel"
            ? ChannelSelectMenuInteraction
            : K extends "select:mentionable"
              ? MentionableSelectMenuInteraction
              : never;

type CommandInteraction<T> = T extends "chatInput"
  ? ChatInputCommandInteraction
  : T extends "user"
    ? UserContextMenuCommandInteraction
    : T extends "message"
      ? MessageContextMenuCommandInteraction
      : never;

type Field<R, K extends string, F> = R extends Record<K, infer V> ? V : F;

export type ComponentParams<P extends ComponentPath> = Field<
  Route<ComponentRoutes, P>,
  "params",
  Params
>;

export type ComponentContext<P extends ComponentPath> = InteractionContext<
  ComponentInteraction<Field<Route<ComponentRoutes, P>, "kind", ComponentKindName>>,
  ComponentParams<P>
> &
  Field<Route<ComponentRoutes, P>, "context", Empty>;

export type CommandContext<P extends CommandPath> = InteractionContext<
  CommandInteraction<Field<Route<CommandRoutes, P>, "type", CommandType>>,
  Empty
> &
  Field<Route<CommandRoutes, P>, "context", Empty>;

/** Every field is optional when the route has no parameters, so `customId("confirm")` works. */
type ParamsArg<P extends ComponentPath> =
  Empty extends ComponentParams<P> ? [params?: ComponentParams<P>] : [params: ComponentParams<P>];

/**
 * The custom ID for a component route, ready for a discord.js builder.
 *
 * Typed against the generated route map: the path must exist and the parameters must match
 * the dynamic segments. Throws when a value is missing or the ID would exceed Discord's limit.
 */
export function customId<P extends ComponentPath>(route: P, ...args: ParamsArg<P>): string {
  return encodeComponentRoute(route, (args[0] ?? {}) as Params);
}

/** A handler that remembers which route it was written for, so the compiler can check the file location. */
export type Routed<F> = F & { route: string };

export function defineCommand<P extends CommandPath>(
  route: P,
  handler: (ctx: CommandContext<P>) => unknown,
): Routed<typeof handler> {
  return routed("defineCommand", route, handler);
}

export interface ComponentOptions<P extends ComponentPath> {
  /**
   * Validators for the route's parameters, run on every incoming custom ID before middleware.
   * A parameter without one accepts any string. When a validator fails the interaction is
   * dropped and reported; the handler never sees it.
   */
  params?: { [K in keyof ComponentParams<P>]?: ParamValidator<ComponentParams<P>[K]> };
}

export function defineComponent<P extends ComponentPath>(
  route: P,
  handler: (ctx: ComponentContext<P>) => unknown,
  options: ComponentOptions<P> = {},
): Routed<typeof handler> {
  const defined = routed("defineComponent", route, handler);
  if (options.params !== undefined) Object.assign(defined, { params: options.params });
  return defined;
}

export function defineEvent<Name extends keyof ClientEvents>(
  event: Name,
  handler: (...args: [...ClientEvents[Name], EventContext]) => unknown,
): Routed<typeof handler> {
  return routed("defineEvent", event, handler);
}

/**
 * `return next({ member })` types `member` onto every downstream context. Middleware that
 * calls `next()` without returning it adds nothing; pass the extension type explicitly if
 * you need both.
 */
export function defineMiddleware<E extends ContextExtension = Empty>(
  middleware: (
    ctx: InteractionContext,
    next: Next,
    // biome-ignore lint/suspicious/noConfusingVoidType: handlers that only call next() return void
  ) => Promise<Extended<E> | undefined | void> | Extended<E> | undefined | void,
): Middleware<E> {
  if (typeof middleware !== "function") {
    throw new TypeError(`defineMiddleware() expects a function, got ${typeof middleware}.`);
  }
  return middleware as Middleware<E>;
}

export function defineError(handler: ErrorHandler): ErrorHandler {
  if (typeof handler !== "function") {
    throw new TypeError(`defineError() expects a function, got ${typeof handler}.`);
  }
  return handler;
}

function routed<F>(name: string, route: string, handler: F): Routed<F> {
  if (typeof route !== "string" || route === "") {
    throw new TypeError(`${name}() expects the route path as its first argument.`);
  }
  if (typeof handler !== "function") {
    throw new TypeError(`${name}("${route}") expects a handler function, got ${typeof handler}.`);
  }
  return Object.assign(handler, { route });
}
