import { defineError } from "@neatjs/core";

export default defineError(async (error, ctx) => {
  console.error(`[${ctx.route.id}]`, error);
  return "unhandled";
});
