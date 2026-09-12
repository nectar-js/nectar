import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Show a profile",
  options: [
    { type: "user", name: "target", description: "Who to look up" },
    { type: "string", name: "section", description: "Which section to show", autocomplete: true },
  ],
};

export default defineCommand("user/profile", async (ctx) => {
  const user = ctx.options.target ?? ctx.interaction.user;
  const section = ctx.options.section ?? "overview";
  await ctx.interaction.reply(`${user.tag}: ${section}`);
});
