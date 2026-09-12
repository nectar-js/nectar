import { defineComponent } from "@nectar-js/nectar";
import { closeTicket } from "../../../../tickets.ts";

export default defineComponent("tickets/[ticketId]/reason", async (interaction, params) => {
  const reason = interaction.fields.getTextInputValue("reason");
  const ticket = closeTicket(params.ticketId, reason);
  await interaction.reply(`Ticket ${ticket.id} closed by ${interaction.user.tag}: ${reason}`);
});
