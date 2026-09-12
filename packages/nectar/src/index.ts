export { version } from "./version.js";

/**
 * Filled in by the generated `.nectar/types.d.ts` through module augmentation. Until then every
 * route path is accepted and parameters are untyped.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmentation target
export interface NectarRoutes {}

/**
 * What plugins put on `ctx.services`. A plugin declares its entry through module augmentation:
 *
 *     declare module "@nectar-js/nectar" {
 *       interface NectarServices { audit: AuditLog }
 *     }
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmentation target
export interface NectarServices {}

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
export type { ParamValidator, StandardSchemaLike } from "./components/params.js";
export { ConfigError, defineConfig, type NectarConfig, validateConfig } from "./config.js";
export {
  type CommandContext,
  type CommandPath,
  type CommandRoutes,
  type ComponentContext,
  type ComponentKindName,
  type ComponentOptions,
  type ComponentParams,
  type ComponentPath,
  type ComponentRoutes,
  customId,
  defineCommand,
  defineComponent,
  defineError,
  defineEvent,
  defineMiddleware,
  type OptionSpecType,
  type OptionValues,
  type Routed,
} from "./define.js";
export type { EventMeta, EventMode } from "./events/compile.js";
export { requiredIntents } from "./events/intents.js";
export {
  definePlugin,
  type NectarPlugin,
  type PluginApp,
  type PluginChange,
  type PluginCommand,
  type PluginCommandContext,
  PluginError,
  type PluginGraph,
} from "./plugins/index.js";
export {
  guildOnly,
  type PolicyOptions,
  type RoleOptions,
  requirePermissions,
  requireRoles,
} from "./policy.js";
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
  RejectReason,
  Signal,
  SignalData,
  SignalEmitter,
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
  Options,
  Params,
  RouteInfo,
  Trace,
} from "./runtime/types.js";
