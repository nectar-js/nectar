import { defineMiddleware } from "@nectar-js/nectar";

// Runs before every interaction. Whatever you pass to next() is on ctx downstream.
export default defineMiddleware(async (_ctx, next) => {
  return next({ startedAt: Date.now() });
});
