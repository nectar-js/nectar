import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export default defineComponent(
  "tickets/[ticketId]/close",
  async (interaction, params) => {
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason")
      .setStyle(TextInputStyle.Paragraph);

    // The modal carries the ticket ID on to its own route.
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(customId("tickets/[ticketId]/reason", params))
        .setTitle(`Close ticket ${params.ticketId}`)
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason)),
    );
  },
  // Anyone can send a button click with an edited custom ID, so check the shape first.
  { params: { ticketId: (value) => /^\d+$/.test(value) } },
);
