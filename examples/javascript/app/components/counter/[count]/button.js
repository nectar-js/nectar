import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// The directory name [count] makes params.count a string decoded from the custom ID.
export default defineComponent("counter/[count]", async (interaction, params) => {
  const count = Number(params.count) + 1;
  const button = new ButtonBuilder()
    .setCustomId(customId("counter/[count]", { count: String(count) }))
    .setLabel(`Clicked ${count} time${count === 1 ? "" : "s"}`)
    .setStyle(ButtonStyle.Primary);
  await interaction.update({
    components: [new ActionRowBuilder().addComponents(button)],
  });
});
