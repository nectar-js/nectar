import { customId, defineCommand, use } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import timing from "../../middleware.js";

/** @type {import("@nectar-js/nectar").CommandMeta} */
export const meta = {
  description: "Check that the bot is alive",
};

export default defineCommand("ping", async (interaction) => {
  const { startedAt } = use(timing);
  const button = new ButtonBuilder()
    .setCustomId(customId("counter/[count]", { count: "0" }))
    .setLabel("Clicked 0 times")
    .setStyle(ButtonStyle.Primary);
  await interaction.reply({
    content: `Pong in ${Date.now() - startedAt}ms`,
    components: [new ActionRowBuilder().addComponents(button)],
  });
});
