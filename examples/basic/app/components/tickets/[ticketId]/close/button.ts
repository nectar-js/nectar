import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export default defineComponent(
  "tickets/[ticketId]/close",
  async (ctx) => {
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason")
      .setStyle(TextInputStyle.Paragraph);

    // The modal carries the ticket ID on to its own route.
    await ctx.interaction.showModal(
      new ModalBuilder()
        .setCustomId(customId("tickets/[ticketId]/reason", ctx.params))
        .setTitle(`Close ticket ${ctx.params.ticketId}`)
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason)),
    );
  },
  // Anyone can send a button click with an edited custom ID, so check the shape first.
  { params: { ticketId: (value) => /^\d+$/.test(value) } },
);
