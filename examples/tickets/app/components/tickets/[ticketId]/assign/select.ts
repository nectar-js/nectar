import { defineComponent } from "@nectar-js/nectar";
import { ChannelType } from "discord.js";
import { assignTicket } from "../../../../tickets.ts";

export const kind = "user";

export default defineComponent("tickets/[ticketId]/assign", async (ctx) => {
  const assignee = ctx.interaction.users.first();
  const guild = ctx.interaction.guild;
  if (assignee === undefined || guild === null) return;

  const ticket = assignTicket(ctx.params.ticketId, assignee.id);

  // Let the assignee into the channel. The channel may be gone if someone deleted it by hand.
  const channel = ticket.channelId === null ? null : await guild.channels.fetch(ticket.channelId);
  if (channel?.type === ChannelType.GuildText) {
    await channel.permissionOverwrites.create(assignee.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
  }
  await ctx.interaction.reply(`Ticket #${ticket.id} assigned to <@${assignee.id}>.`);
});
