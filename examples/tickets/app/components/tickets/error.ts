import { defineError } from "@nectar-js/nectar";
import { MessageFlags } from "discord.js";
import { TicketNotFound } from "../../tickets.ts";

// Buttons and menus outlive their ticket: a message can be clicked long after the ticket
// closed or was pruned. Anything else goes up to app/error.ts.
export default defineError(async (error, ctx) => {
  if (!(error instanceof TicketNotFound)) return "unhandled";
  if (!("interaction" in ctx) || !ctx.interaction.isRepliable()) return;
  await ctx.interaction.reply({
    content: "That ticket is already closed.",
    flags: MessageFlags.Ephemeral,
  });
});
