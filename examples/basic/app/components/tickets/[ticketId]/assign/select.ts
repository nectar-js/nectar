import { defineComponent } from "@neatjs/core";

export const kind = "user";

export default defineComponent("tickets/[ticketId]/assign", async (ctx) => {
  const assignee = ctx.interaction.users.first();
  await ctx.interaction.update({
    content: `Ticket ${ctx.params.ticketId} assigned to ${assignee?.tag ?? "nobody"}`,
  });
});
