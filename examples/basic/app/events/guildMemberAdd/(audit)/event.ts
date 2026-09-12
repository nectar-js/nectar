import { defineEvent, route } from "@nectar-js/nectar";

export const meta = { order: 1 };

export default defineEvent("guildMemberAdd", async (member) => {
  console.log(`[${route().id}] ${member.user.tag} joined ${member.guild.name}`);
});
