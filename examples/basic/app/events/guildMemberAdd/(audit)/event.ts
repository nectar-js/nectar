import { defineEvent } from "@neatjs/core";

export const meta = { order: 1 };

export default defineEvent("guildMemberAdd", async (member, ctx) => {
  console.log(`[${ctx.route.id}] ${member.user.tag} joined ${member.guild.name}`);
});
