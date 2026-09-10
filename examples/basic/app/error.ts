import { defineError } from "@nectar-js/nectar";

export default defineError(async (error, ctx) => {
  console.error(`[${ctx.route.id}]`, error);
  return "unhandled";
});
