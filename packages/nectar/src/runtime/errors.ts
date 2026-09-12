import type { Interaction } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import type { LogFields } from "./logger.js";
import type { ModuleRegistry } from "./modules.js";
import type { Scope } from "./scope.js";
import { type InteractionMeta, interactionMeta } from "./signals.js";
import type { ErrorHandler, Logger } from "./types.js";

/** The reply the default boundary sends when an interaction is still unanswered. */
export const GENERIC_ERROR_REPLY = "Something went wrong while handling that.";

/**
 * Passes an error through the route's boundaries, nearest first, then the default boundary.
 * A boundary handles the error by returning normally. Returning `"unhandled"` or throwing
 * hands it (or the newly thrown error) to the next one. Nothing is ever swallowed: the default
 * boundary always logs.
 *
 * `middleware` is the chain that ran before the handler; development output lists it.
 * Resolves to the boundary file that handled the error, or `null` for the default boundary.
 */
export async function handleError(
  error: unknown,
  scope: Scope,
  boundaries: readonly string[],
  modules: ModuleRegistry,
  logger: Logger,
  middleware: readonly string[] = [],
): Promise<string | null> {
  let current = error;
  for (const file of boundaries) {
    try {
      const boundary = await modules.loadDefault<ErrorHandler>(file, "An error boundary");
      const result = await boundary(current, scope.interaction);
      if (result !== "unhandled") return file;
    } catch (thrown) {
      current = thrown;
    }
  }
  await defaultBoundary(current, scope, logger, middleware);
  return null;
}

/** The structured metadata every framework log line about a route carries. */
export function logFields(scope: Scope, meta?: InteractionMeta): LogFields {
  const fields: LogFields = { route: scope.route.id };
  if (scope.interaction === null) {
    fields.event = scope.route.path.split("/")[0];
    return fields;
  }
  const i = meta ?? interactionMeta(scope.interaction);
  if (scope.trace !== null) fields.trace = scope.trace.id;
  fields.interaction = i.type;
  if (i.command !== undefined) fields.command = i.command;
  if (i.customId !== undefined) fields.customId = i.customId;
  fields.guild = i.guildId;
  fields.channel = i.channelId;
  fields.user = i.userId;
  return fields;
}

async function defaultBoundary(
  error: unknown,
  scope: Scope,
  logger: Logger,
  middleware: readonly string[],
): Promise<void> {
  logger.error(
    scope.env === "development"
      ? developmentReport(scope, middleware)
      : `Unhandled error in ${scope.route.id} (${scope.route.file})`,
    { ...logFields(scope), error },
  );

  if (scope.interaction === null) return;
  const interaction = scope.interaction as unknown as RepliableLike;
  if (typeof interaction.isRepliable !== "function" || !interaction.isRepliable()) return;
  if (interaction.replied) return;

  try {
    // A deferred reply is already on screen as a spinner, so fill it in rather than leave it.
    if (interaction.deferred) await interaction.editReply({ content: GENERIC_ERROR_REPLY });
    else await interaction.reply({ content: GENERIC_ERROR_REPLY, flags: MessageFlags.Ephemeral });
  } catch (replyError) {
    logger.error(`Could not send the error reply for ${scope.route.id}`, {
      ...logFields(scope),
      error: replyError,
    });
  }
}

/** Where the failure sits in the app, so the developer can go straight to the boundary. */
function developmentReport(scope: Scope, middleware: readonly string[]): string {
  const rows: [string, string][] = [["file", scope.route.file]];
  if (scope.interaction !== null) {
    rows.push(["interaction", describeInteraction(scope.interaction)]);
    // Discord gives a handler 3000ms to respond. Far past that means a slow handler or a
    // second process on the same token that answered first.
    if (scope.trace !== null) {
      rows.push(["elapsed", `${scope.trace.elapsed()}ms since Discord created it`]);
    }
    rows.push([
      "middleware",
      middleware.length === 0 ? "none" : middleware.join(`\n${" ".repeat(15)}`),
    ]);
  }
  const width = Math.max(...rows.map(([key]) => key.length));
  return [
    `Unhandled error in ${scope.route.id}`,
    ...rows.map(([key, value]) => `  ${key.padEnd(width)}  ${value}`),
  ].join("\n");
}

function describeInteraction(interaction: Interaction): string {
  const meta = interactionMeta(interaction);
  let what: string;
  switch (meta.type) {
    case "chatInput":
      what = `/${meta.command}`;
      break;
    case "autocomplete":
      what = `autocomplete for /${meta.command}`;
      break;
    case "userContextMenu":
    case "messageContextMenu":
      what = `context menu "${meta.command}"`;
      break;
    case "unknown":
      what = "unknown interaction";
      break;
    default:
      what = `${meta.type} "${meta.customId}"`;
  }
  const where = [
    meta.guildId === null ? "direct message" : `guild ${meta.guildId}`,
    meta.channelId === null ? null : `channel ${meta.channelId}`,
    meta.userId === null ? null : `user ${meta.userId}`,
  ].filter((p): p is string => p !== null);
  return `${what} (${where.join(", ")})`;
}

interface RepliableLike {
  isRepliable?: () => boolean;
  replied?: boolean;
  deferred?: boolean;
  reply: (options: { content: string; flags: MessageFlags }) => Promise<unknown>;
  editReply: (options: { content: string }) => Promise<unknown>;
}
