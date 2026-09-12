import { defineMiddleware } from "@nectar-js/nectar";
import type { UsageCommand } from "./index.ts";

export default defineMiddleware(async (ctx, next) => {
  // The plugin only attaches this to command routes, and the generated UsageCommand union
  // comes from the same route graph, so the path is always one of them.
  ctx.services.usage.record(ctx.route.path as UsageCommand, ctx.interaction.user.id);
  return next();
});
