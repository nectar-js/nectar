import { type CommandMeta, defineCommand } from "@nect-js/core";

export const meta: CommandMeta = {
  description: "Show a profile",
  options: [
    { type: "user", name: "target", description: "Who to look up" },
    { type: "string", name: "section", description: "Which section to show", autocomplete: true },
  ],
};

export default defineCommand("user/profile", async (ctx) => {
  const user = ctx.interaction.options.getUser("target") ?? ctx.interaction.user;
  const section = ctx.interaction.options.getString("section") ?? "overview";
  await ctx.interaction.reply(`${user.tag}: ${section}`);
});
