import { type CommandMeta, customId, defineCommand } from "@nectar-js/nectar";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  UserSelectMenuBuilder,
} from "discord.js";
import { openTicket } from "../../../tickets.ts";

export const meta: CommandMeta = {
  description: "Open a support ticket",
  options: [
    {
      type: "string",
      name: "subject",
      description: "What the ticket is about",
      required: true,
      maxLength: 100,
    },
  ],
};

export default defineCommand("ticket/open", async (ctx) => {
  const ticket = openTicket(ctx.options.subject, ctx.interaction.user.id);
  const ticketId = String(ticket.id);

  const close = new ButtonBuilder()
    .setCustomId(customId("tickets/[ticketId]/close", { ticketId }))
    .setLabel("Close")
    .setStyle(ButtonStyle.Danger);
  const assign = new UserSelectMenuBuilder()
    .setCustomId(customId("tickets/[ticketId]/assign", { ticketId }))
    .setPlaceholder("Assign to");

  // A Components V2 message: the layout lives in the container, and there is no `content`.
  const card = new ContainerBuilder()
    .addTextDisplayComponents((text) =>
      text.setContent(
        `## Ticket #${ticket.id}\n${ticket.subject}\nOpened by <@${ticket.openedBy}>`,
      ),
    )
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(close))
    .addActionRowComponents(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(assign));

  await ctx.interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [card] });
});
