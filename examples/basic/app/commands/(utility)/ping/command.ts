import { type CommandMeta, defineCommand, use } from "@nectar-js/nectar";
import timing from "../../../middleware.ts";

export const meta: CommandMeta = {
  description: "Check that the bot is alive",
};

export default defineCommand("ping", async (interaction) => {
  const { startedAt } = use(timing);
  await interaction.reply(`Pong in ${Date.now() - startedAt}ms`);
});
