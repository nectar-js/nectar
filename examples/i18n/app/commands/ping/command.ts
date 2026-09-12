import { localizations, t } from "@nectar-js/i18n";
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Check that the bot is alive",
  descriptionLocalizations: localizations("ping.description"),
};

export default defineCommand("ping", async (interaction) => {
  await interaction.reply(t("ping.pong", { ms: Date.now() - interaction.createdTimestamp }));
});
