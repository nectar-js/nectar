import { defineComponent } from "@nectar-js/nectar";
import { assignTicket } from "../../../../tickets.ts";

export const kind = "user";

export default defineComponent("tickets/[ticketId]/assign", async (interaction, params) => {
  const assignee = interaction.users.first();
  if (assignee === undefined) return;
  const ticket = assignTicket(params.ticketId, assignee.id);
  await interaction.update({ content: `Ticket ${ticket.id} assigned to ${assignee.tag}` });
});
