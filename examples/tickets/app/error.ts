import { defineError } from "@nectar-js/nectar";

// Everything unhandled below ends up here, then in Nectar's default boundary, which logs it
// and answers the user.
export default defineError(async (error, ctx) => {
  console.error(`[${ctx.route.id}]`, error);
  return "unhandled";
});
