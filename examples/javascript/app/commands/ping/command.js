import { customId, defineCommand } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

/** @type {import("@nectar-js/nectar").CommandMeta} */
export const meta = {
  description: "Check that the bot is alive",
};

export default defineCommand("ping", async (ctx) => {
  const button = new ButtonBuilder()
    .setCustomId(customId("counter/[count]", { count: "0" }))
    .setLabel("Clicked 0 times")
    .setStyle(ButtonStyle.Primary);
  await ctx.interaction.reply({
    content: `Pong in ${Date.now() - ctx.startedAt}ms`,
    components: [new ActionRowBuilder().addComponents(button)],
  });
});
