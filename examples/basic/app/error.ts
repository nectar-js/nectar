import { defineError } from "@nect-js/core";

export default defineError(async (error, ctx) => {
  console.error(`[${ctx.route.id}]`, error);
  return "unhandled";
});
