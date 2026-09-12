import { defineMiddleware, stop } from "@nectar-js/nectar";

// Commands below read the member with use(guard). Outside a cached guild nothing runs.
export default defineMiddleware(async (interaction) => {
  if (!interaction.inCachedGuild()) return stop;
  return { member: interaction.member };
});
