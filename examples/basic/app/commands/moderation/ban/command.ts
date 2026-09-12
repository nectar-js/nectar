import { type CommandMeta, defineCommand, use } from "@nectar-js/nectar";
import guard from "../middleware.ts";

export const meta: CommandMeta = {
  description: "Ban a member",
  options: [
    { type: "user", name: "target", description: "Who to ban", required: true },
    { type: "string", name: "reason", description: "Why", maxLength: 512 },
    {
      type: "integer",
      name: "days",
      description: "Days of messages to delete",
      minValue: 0,
      maxValue: 7,
    },
  ],
};

export default defineCommand("moderation/ban", async (interaction, { target, reason }) => {
  const { member } = use(guard);
  const why = reason ?? "No reason given";
  await interaction.guild?.members.ban(target, { reason: why });
  await interaction.reply(`${member.displayName} banned ${target.tag}: ${why}`);
});
