import { type CommandMeta, customId, defineCommand } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } from "discord.js";
import { openTicket } from "../../tickets.ts";

export const meta: CommandMeta = {
  description: "Open a support ticket",
  options: [{ type: "string", name: "subject", description: "What it's about", required: true }],
};

export default defineCommand("ticket", async (ctx) => {
  const ticket = openTicket(ctx.options.subject, ctx.interaction.user.id);

  const close = new ButtonBuilder()
    .setCustomId(customId("tickets/[ticketId]/close", { ticketId: ticket.id }))
    .setLabel("Close")
    .setStyle(ButtonStyle.Danger);
  const assign = new UserSelectMenuBuilder()
    .setCustomId(customId("tickets/[ticketId]/assign", { ticketId: ticket.id }))
    .setPlaceholder("Assign to");

  await ctx.interaction.reply({
    content: `Ticket ${ticket.id} opened: ${ticket.subject}`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(close),
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(assign),
    ],
  });
});
