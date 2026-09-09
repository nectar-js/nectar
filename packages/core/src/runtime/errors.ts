import type { ModuleRegistry } from "./modules.js";
import type { ErrorHandler, EventContext, InteractionContext, Logger } from "./types.js";

/** The reply the default boundary sends when an interaction is still unanswered. */
export const GENERIC_ERROR_REPLY = "Something went wrong while handling that.";

/**
 * Passes an error through the route's boundaries, nearest first, then the default boundary.
 * A boundary handles the error by returning normally. Returning `"unhandled"` or throwing
 * hands it (or the newly thrown error) to the next one. Nothing is ever swallowed: the default
 * boundary always logs.
 */
export async function handleError(
  error: unknown,
  ctx: InteractionContext | EventContext,
  boundaries: readonly string[],
  modules: ModuleRegistry,
  logger: Logger,
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
  await defaultBoundary(current, ctx, logger);
}

async function defaultBoundary(
  error: unknown,
  ctx: InteractionContext | EventContext,
  logger: Logger,
): Promise<void> {
  logger.error(`Unhandled error in ${ctx.route.id} (${ctx.route.file})`, error);

  if (!("interaction" in ctx)) return;
  const interaction = ctx.interaction as RepliableLike;
  if (typeof interaction.isRepliable !== "function" || !interaction.isRepliable()) return;
  if (interaction.replied || interaction.deferred) return;

  try {
    await interaction.reply({ content: GENERIC_ERROR_REPLY, ephemeral: true });
  } catch (replyError) {
    logger.error(`Could not send the error reply for ${ctx.route.id}`, replyError);
  }
}

interface RepliableLike {
  isRepliable?: () => boolean;
  replied?: boolean;
  deferred?: boolean;
  reply: (options: { content: string; ephemeral: boolean }) => Promise<unknown>;
}
