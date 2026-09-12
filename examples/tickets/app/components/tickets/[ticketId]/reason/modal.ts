import { defineComponent } from "@nectar-js/nectar";
import { MessageFlags } from "discord.js";
import { closeTicket } from "../../../../tickets.ts";

export default defineComponent("tickets/[ticketId]/reason", async (interaction, params) => {
  const guild = interaction.guild;
  if (guild === null) return;

  const reason = interaction.fields.getTextInputValue("reason");
  const ticket = closeTicket(params.ticketId, reason);

  // The modal was submitted from inside the ticket channel, which is about to go, so the
  // confirmation is ephemeral and only the person closing sees it.
  await interaction.reply({
    content: `Ticket #${ticket.id} closed: ${reason}`,
    flags: MessageFlags.Ephemeral,
  });
  const channel = ticket.channelId === null ? null : await guild.channels.fetch(ticket.channelId);
  await channel?.delete(`Ticket #${ticket.id} closed by ${interaction.user.tag}: ${reason}`);
});
