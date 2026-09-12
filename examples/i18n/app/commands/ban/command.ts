import { localizations, t } from "@nectar-js/i18n";
import { type CommandMeta, customId, defineCommand } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";

export const meta: CommandMeta = {
  description: "Ban a member",
  descriptionLocalizations: localizations("ban.description"),
  options: [
    {
      type: "user",
      name: "member",
      description: "Who to ban",
      nameLocalizations: localizations("ban.target.name"),
      descriptionLocalizations: localizations("ban.target.description"),
      required: true,
    },
  ],
};

export default defineCommand("ban", async (interaction, { member }) => {
  const confirm = new ButtonBuilder()
    .setCustomId(customId("ban/[userId]/confirm", { userId: member.id }))
    .setLabel(t("ban.button"))
    .setStyle(ButtonStyle.Danger);
  await interaction.reply({
    content: t("ban.confirm", { user: member.toString() }),
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirm)],
    flags: MessageFlags.Ephemeral,
  });
});
