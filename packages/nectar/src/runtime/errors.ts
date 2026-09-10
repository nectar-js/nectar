import type { Interaction } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import type { LogFields } from "./logger.js";
import type { ModuleRegistry } from "./modules.js";
import { type InteractionMeta, interactionMeta } from "./signals.js";
import type { ErrorHandler, EventContext, InteractionContext, Logger } from "./types.js";

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
  ctx: InteractionContext | EventContext,
  boundaries: readonly string[],
  modules: ModuleRegistry,
  logger: Logger,
  middleware: readonly string[] = [],
): Promise<string | null> {
  let current = error;
  for (const file of boundaries) {
    try {
      const boundary = await modules.loadDefault<ErrorHandler>(file, "An error boundary");
      const result = await boundary(current, ctx);
      if (result !== "unhandled") return file;
    } catch (thrown) {
      current = thrown;
    }
  }
  await defaultBoundary(current, ctx, logger, middleware);
  return null;
}

/** The structured metadata every framework log line about a route carries. */
export function logFields(
  ctx: InteractionContext | EventContext,
  meta?: InteractionMeta,
): LogFields {
  const fields: LogFields = { route: ctx.route.id };
  if (!("interaction" in ctx)) {
    fields.event = ctx.route.path.split("/")[0];
    return fields;
  }
  const i = meta ?? interactionMeta(ctx.interaction);
  fields.trace = ctx.trace.id;
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
  ctx: InteractionContext | EventContext,
  logger: Logger,
  middleware: readonly string[],
): Promise<void> {
  logger.error(
    ctx.env === "development"
      ? developmentReport(ctx, middleware)
      : `Unhandled error in ${ctx.route.id} (${ctx.route.file})`,
    { ...logFields(ctx), error },
  );

  if (!("interaction" in ctx)) return;
  const interaction = ctx.interaction as RepliableLike;
  if (typeof interaction.isRepliable !== "function" || !interaction.isRepliable()) return;
  if (interaction.replied || interaction.deferred) return;

  try {
    await interaction.reply({ content: GENERIC_ERROR_REPLY, flags: MessageFlags.Ephemeral });
  } catch (replyError) {
    logger.error(`Could not send the error reply for ${ctx.route.id}`, {
      ...logFields(ctx),
      error: replyError,
    });
  }
}

/** Where the failure sits in the app, so the developer can go straight to the boundary. */
function developmentReport(
  ctx: InteractionContext | EventContext,
  middleware: readonly string[],
): string {
  const rows: [string, string][] = [["file", ctx.route.file]];
  if ("interaction" in ctx) {
    rows.push(["interaction", describeInteraction(ctx.interaction)]);
    // Discord gives a handler 3000ms to respond. Far past that means a slow handler or a
    // second process on the same token that answered first.
    rows.push(["elapsed", `${ctx.trace.elapsed()}ms since Discord created it`]);
    rows.push([
      "middleware",
      middleware.length === 0 ? "none" : middleware.join(`\n${" ".repeat(15)}`),
    ]);
  }
  const width = Math.max(...rows.map(([key]) => key.length));
  return [
    `Unhandled error in ${ctx.route.id}`,
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
}
