import { defineComponent } from "@nectar-js/nectar";
import { assignTicket } from "../../../../tickets.ts";

export const kind = "user";

export default defineComponent("tickets/[ticketId]/assign", async (ctx) => {
  const assignee = ctx.interaction.users.first();
  if (assignee === undefined) return;
  const ticket = assignTicket(ctx.params.ticketId, assignee.id);
  await ctx.interaction.reply(`Ticket #${ticket.id} assigned to <@${ticket.assignee}>.`);
});
