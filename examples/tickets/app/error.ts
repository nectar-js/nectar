import { defineError, route } from "@nectar-js/nectar";

// Everything unhandled below ends up here, then in Nectar's default boundary, which logs it
// and answers the user.
export default defineError(async (error) => {
  console.error(`[${route().id}]`, error);
  return "unhandled";
});
