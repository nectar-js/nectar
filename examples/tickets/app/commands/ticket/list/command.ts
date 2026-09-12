import { type CommandMeta, defineCommand } from "@nectar-js/nectar";
import { openTickets } from "../../../tickets.ts";

// The reply is deferred before the handler runs, so a slow query cannot miss Discord's three
// second window. The handler answers with editReply.
export const meta: CommandMeta = { description: "List open tickets", defer: "ephemeral" };

export default defineCommand("ticket/list", async (ctx) => {
  const tickets = openTickets();
  if (tickets.length === 0) {
    await ctx.interaction.editReply("No open tickets.");
    return;
  }
  const lines = tickets.map(
    (t) => `#${t.id} ${t.subject} (${t.assignee === null ? "unassigned" : `<@${t.assignee}>`})`,
  );
  await ctx.interaction.editReply(lines.join("\n"));
});
