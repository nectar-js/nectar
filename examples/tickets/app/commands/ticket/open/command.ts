import { type CommandMeta, customId, defineCommand } from "@nectar-js/nectar";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  UserSelectMenuBuilder,
} from "discord.js";
import { openTicket, setTicketChannel } from "../../../tickets.ts";

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

const ACCESS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

export default defineCommand("ticket/open", async (interaction, { subject }) => {
  const { guild, user, client } = interaction;
  if (guild === null) return;

  const ticket = openTicket(subject, user.id);
  const ticketId = String(ticket.id);

  // A private channel: hidden from @everyone (whose role ID is the guild ID), open to the
  // person who asked and to the bot. Assignees are added when they're picked.
  const channel = await guild.channels.create({
    name: `ticket-${ticket.id}`,
    type: ChannelType.GuildText,
    topic: ticket.subject,
    ...(process.env.TICKETS_CATEGORY_ID ? { parent: process.env.TICKETS_CATEGORY_ID } : {}),
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: ACCESS },
      { id: client.user.id, allow: ACCESS },
    ],
  });
  setTicketChannel(ticket.id, channel.id);

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
      text.setContent(`## Ticket #${ticket.id}\n${ticket.subject}\nOpened by <@${user.id}>`),
    )
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(close))
    .addActionRowComponents(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(assign));

  await channel.send({ flags: MessageFlags.IsComponentsV2, components: [card] });
  await interaction.reply({
    content: `Ticket #${ticket.id} opened in <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
});
