import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export default defineComponent(
  "tickets/[ticketId]/close",
  async (ctx) => {
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(500);

    await ctx.interaction.showModal(
      new ModalBuilder()
        .setCustomId(customId("tickets/[ticketId]/reason", ctx.params))
        .setTitle(`Close ticket #${ctx.params.ticketId}`)
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason)),
    );
  },
  // Custom IDs can be edited by the client. Reject anything that is not a ticket number.
  { params: { ticketId: (value) => /^\d+$/.test(value) } },
);
