import { defineError, route } from "@nectar-js/nectar";

export default defineError(async (error) => {
  console.error(`[${route().id}]`, error);
  return "unhandled";
});
