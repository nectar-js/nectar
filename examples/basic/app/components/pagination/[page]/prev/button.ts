import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export default defineComponent("pagination/[page]/prev", async (ctx) => {
  const page = Math.max(1, Number(ctx.params.page) - 1);
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
  await ctx.interaction.update({ content: `Page ${page}`, components: [row] });
});
