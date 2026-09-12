import { defineComponent } from "@nectar-js/nectar";
import { closeTicket } from "../../../../tickets.ts";

export default defineComponent("tickets/[ticketId]/reason", async (ctx) => {
  const reason = ctx.interaction.fields.getTextInputValue("reason");
  const ticket = closeTicket(ctx.params.ticketId, reason);
  await ctx.interaction.reply(
    `Ticket ${ticket.id} closed by ${ctx.interaction.user.tag}: ${reason}`,
  );
});
