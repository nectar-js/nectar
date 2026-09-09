import { defineMiddleware } from "@nect-js/core";

export default defineMiddleware(async (_ctx, next) => {
  const startedAt = Date.now();
  return next({ startedAt });
});
