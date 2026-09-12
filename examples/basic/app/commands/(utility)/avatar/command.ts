import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

// A user context menu command: right-click a member, Apps, "Avatar". No description or options.
export const meta: CommandMeta = { type: "user", name: "Avatar" };

export default defineCommand("avatar", async (interaction) => {
  await interaction.reply(interaction.targetUser.displayAvatarURL({ size: 512 }));
});
