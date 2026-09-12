import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Check that the bot is alive",
};

export default defineCommand("ping", async (interaction) => {
  await interaction.reply("Pong");
});
