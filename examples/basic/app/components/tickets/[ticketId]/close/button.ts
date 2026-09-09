import { defineComponent } from "@nect-js/core";

export default defineComponent("tickets/[ticketId]/close", async (ctx) => {
  await ctx.interaction.update({
    content: `Ticket ${ctx.params.ticketId} closed by ${ctx.interaction.user.tag}`,
    components: [],
  });
});
