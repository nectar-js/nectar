import type { Interaction } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import type { ModuleRegistry } from "./modules.js";
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
 */
export async function handleError(
  error: unknown,
  ctx: InteractionContext | EventContext,
  boundaries: readonly string[],
  modules: ModuleRegistry,
  logger: Logger,
  middleware: readonly string[] = [],
): Promise<void> {
  let current = error;
  for (const file of boundaries) {
    try {
      const boundary = await modules.loadDefault<ErrorHandler>(file, "An error boundary");
      const result = await boundary(current, ctx);
      if (result !== "unhandled") return;
    } catch (thrown) {
      current = thrown;
    }
  }
  await defaultBoundary(current, ctx, logger, middleware);
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
    error,
  );

  if (!("interaction" in ctx)) return;
  const interaction = ctx.interaction as RepliableLike;
  if (typeof interaction.isRepliable !== "function" || !interaction.isRepliable()) return;
  if (interaction.replied || interaction.deferred) return;

  try {
    await interaction.reply({ content: GENERIC_ERROR_REPLY, flags: MessageFlags.Ephemeral });
  } catch (replyError) {
    logger.error(`Could not send the error reply for ${ctx.route.id}`, replyError);
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
  const i = interaction as unknown as InteractionLike;
  const guard = (name: keyof InteractionLike) => typeof i[name] === "function" && i[name]();
  let what: string;
  if (guard("isChatInputCommand") || guard("isAutocomplete")) {
    const options = i.options;
    const parts = [
      i.commandName,
      options?.getSubcommandGroup(false) ?? null,
      options?.getSubcommand(false) ?? null,
    ].filter((p): p is string => typeof p === "string");
    what = `${guard("isAutocomplete") ? "autocomplete for " : ""}/${parts.join(" ")}`;
  } else if (guard("isContextMenuCommand")) {
    what = `context menu "${i.commandName}"`;
  } else if (guard("isButton")) {
    what = `button "${i.customId}"`;
  } else if (guard("isAnySelectMenu")) {
    what = `select "${i.customId}"`;
  } else if (guard("isModalSubmit")) {
    what = `modal "${i.customId}"`;
  } else {
    what = "unknown interaction";
  }
  const where = [
    i.guildId ? `guild ${i.guildId}` : "direct message",
    i.channelId ? `channel ${i.channelId}` : null,
    i.user?.id ? `user ${i.user.id}` : null,
  ].filter((p): p is string => p !== null);
  return `${what} (${where.join(", ")})`;
}

interface InteractionLike {
  isChatInputCommand?: () => boolean;
  isAutocomplete?: () => boolean;
  isContextMenuCommand?: () => boolean;
  isButton?: () => boolean;
  isAnySelectMenu?: () => boolean;
  isModalSubmit?: () => boolean;
  commandName?: string;
  customId?: string;
  guildId?: string | null;
  channelId?: string | null;
  user?: { id: string };
  options?: {
    getSubcommandGroup(required: false): string | null;
    getSubcommand(required: false): string | null;
  };
}

interface RepliableLike {
  isRepliable?: () => boolean;
  replied?: boolean;
  deferred?: boolean;
  reply: (options: { content: string; flags: MessageFlags }) => Promise<unknown>;
}
