export { version } from "./version.js";

/**
 * Filled in by the generated `.neat/types.d.ts` through module augmentation. Until then every
 * route path is accepted and parameters are untyped.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmentation target
export interface NeatRoutes {}

export type {
  ChannelOption,
  CommandMeta,
  CommandOption,
  CommandRouteMeta,
  CommandType,
  IntegerOption,
  NumberOption,
  OptionChoice,
  OptionType,
  SimpleOption,
  StringOption,
  TopLevelMeta,
} from "./commands/meta.js";
export type { SelectKind } from "./components/compile.js";
export { CustomIdTooLongError, MAX_CUSTOM_ID_LENGTH } from "./components/customId.js";
export { ConfigError, defineConfig, type NeatConfig, validateConfig } from "./config.js";
export {
  type CommandContext,
  type CommandPath,
  type CommandRoutes,
  type ComponentContext,
  type ComponentKindName,
  type ComponentParams,
  type ComponentPath,
  type ComponentRoutes,
  customId,
  defineCommand,
  defineComponent,
  defineError,
  defineEvent,
  defineMiddleware,
  type Routed,
} from "./define.js";
export type { EventMeta, EventMode } from "./events/compile.js";
export type {
  ContextExtension,
  Env,
  ErrorHandler,
  EventContext,
  Extended,
  InteractionContext,
  Middleware,
  MiddlewareExtension,
  Next,
  Params,
  RouteInfo,
  Trace,
} from "./runtime/types.js";
