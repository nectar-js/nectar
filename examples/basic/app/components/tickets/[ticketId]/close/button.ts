import { defineComponent } from "@nectar-js/nectar";

export default defineComponent("tickets/[ticketId]/close", async (ctx) => {
  await ctx.interaction.update({
    content: `Ticket ${ctx.params.ticketId} closed by ${ctx.interaction.user.tag}`,
    components: [],
  });
});
