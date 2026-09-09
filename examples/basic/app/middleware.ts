import { defineMiddleware } from "@neatjs/core";

export default defineMiddleware(async (_ctx, next) => {
  const startedAt = Date.now();
  return next({ startedAt });
});
