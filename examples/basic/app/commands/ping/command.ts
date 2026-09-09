import { type CommandMeta, defineCommand } from "@nect-js/core";

export const meta: CommandMeta = {
  description: "Check that the bot is alive",
};

export default defineCommand("ping", async (ctx) => {
  await ctx.interaction.reply(`Pong in ${Date.now() - ctx.startedAt}ms`);
});
