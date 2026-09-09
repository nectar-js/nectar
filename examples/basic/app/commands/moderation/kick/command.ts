import { type CommandMeta, defineCommand } from "@nect-js/core";

export const meta: CommandMeta = {
  description: "Kick a member",
  options: [
    { type: "user", name: "target", description: "Who to kick", required: true },
    { type: "string", name: "reason", description: "Why" },
  ],
};

export default defineCommand("moderation/kick", async (ctx) => {
  const target = ctx.interaction.options.getUser("target", true);
  const reason = ctx.interaction.options.getString("reason") ?? "No reason given";
  await ctx.interaction.guild?.members.kick(target, reason);
  await ctx.interaction.reply(`${ctx.member.displayName} kicked ${target.tag}: ${reason}`);
});
