import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export default defineComponent("pagination/[page]/prev", async (interaction, params) => {
  const page = Math.max(1, Number(params.page) - 1);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId("pagination/[page]/prev", { page: String(page) }))
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(customId("pagination/[page]/next", { page: String(page) }))
      .setLabel("Next")
      .setStyle(ButtonStyle.Primary),
  );
  await interaction.update({ content: `Page ${page}`, components: [row] });
});
