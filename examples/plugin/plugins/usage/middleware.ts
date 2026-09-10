import { defineMiddleware } from "@nectar-js/nectar";

export default defineMiddleware(async (ctx, next) => {
  ctx.services.usage.record(ctx.route.path, ctx.interaction.user.id);
  return next();
});
