import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Check that the bot is alive",
};

export default defineCommand("ping", async (ctx) => {
  await ctx.interaction.reply("Pong");
});
