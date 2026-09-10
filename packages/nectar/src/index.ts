export { version } from "./version.js";

/**
 * Filled in by the generated `.nectar/types.d.ts` through module augmentation. Until then every
 * route path is accepted and parameters are untyped.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmentation target
export interface NectarRoutes {}

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
export { ConfigError, defineConfig, type NectarConfig, validateConfig } from "./config.js";
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
export {
  type CommandDiff,
  RegistrationError,
  type RegistrationProblem,
  type Scope,
  type ScopeSync,
  type SyncOptions,
  type SyncResult,
  syncCommands,
  UnsafeSyncError,
} from "./registration/index.js";
export type {
  LogFields,
  LoggerOptions,
  LogLevel,
  LogRecord,
  LogSink,
} from "./runtime/logger.js";
export type {
  InteractionMeta,
  Signal,
  SignalData,
  SignalType,
} from "./runtime/signals.js";
export type {
  ContextExtension,
  Env,
  ErrorHandler,
  EventContext,
  Extended,
  InteractionContext,
  Logger,
  Middleware,
  MiddlewareExtension,
  Next,
  Params,
  RouteInfo,
  Trace,
} from "./runtime/types.js";
