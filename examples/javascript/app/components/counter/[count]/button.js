import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// The directory name [count] makes ctx.params.count a string decoded from the custom ID.
export default defineComponent("counter/[count]", async (ctx) => {
  const count = Number(ctx.params.count) + 1;
  const button = new ButtonBuilder()
    .setCustomId(customId("counter/[count]", { count: String(count) }))
    .setLabel(`Clicked ${count} time${count === 1 ? "" : "s"}`)
    .setStyle(ButtonStyle.Primary);
  await ctx.interaction.update({
    components: [new ActionRowBuilder().addComponents(button)],
  });
});
