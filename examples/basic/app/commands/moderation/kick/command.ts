import { type CommandMeta, defineCommand, use } from "@nectar-js/nectar";
import guard from "../middleware.ts";

export const meta: CommandMeta = {
  description: "Kick a member",
  options: [
    { type: "user", name: "target", description: "Who to kick", required: true },
    { type: "string", name: "reason", description: "Why" },
  ],
};

export default defineCommand("moderation/kick", async (interaction, { target, reason }) => {
  const { member } = use(guard);
  const why = reason ?? "No reason given";
  await interaction.guild?.members.kick(target, why);
  await interaction.reply(`${member.displayName} kicked ${target.tag}: ${why}`);
});
