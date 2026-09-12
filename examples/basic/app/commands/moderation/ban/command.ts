import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

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

export default defineCommand("moderation/ban", async (ctx) => {
  const { target } = ctx.options;
  const reason = ctx.options.reason ?? "No reason given";
  await ctx.interaction.guild?.members.ban(target, { reason });
  await ctx.interaction.reply(`${ctx.member.displayName} banned ${target.tag}: ${reason}`);
});
