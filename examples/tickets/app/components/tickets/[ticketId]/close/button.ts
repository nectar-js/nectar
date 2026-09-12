import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export default defineComponent(
  "tickets/[ticketId]/close",
  async (interaction, params) => {
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(500);

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(customId("tickets/[ticketId]/reason", params))
        .setTitle(`Close ticket #${params.ticketId}`)
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason)),
    );
  },
  // Custom IDs can be edited by the client. Reject anything that is not a ticket number.
  { params: { ticketId: (value) => /^\d+$/.test(value) } },
);
