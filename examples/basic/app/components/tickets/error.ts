import { defineError } from "@nectar-js/nectar";
import { MessageFlags } from "discord.js";
import { TicketNotFound } from "../../tickets.ts";

// Only tickets that no longer exist are handled here. Everything else goes up to app/error.ts.
export default defineError(async (error, ctx) => {
  if (!(error instanceof TicketNotFound)) return "unhandled";
  if (!("interaction" in ctx) || !ctx.interaction.isRepliable()) return;
  await ctx.interaction.reply({
    content: "That ticket no longer exists.",
    flags: MessageFlags.Ephemeral,
  });
});
