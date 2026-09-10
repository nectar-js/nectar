import { defineMiddleware } from "@nectar-js/nectar";

export default defineMiddleware(async (_ctx, next) => {
  const startedAt = Date.now();
  return next({ startedAt });
});
