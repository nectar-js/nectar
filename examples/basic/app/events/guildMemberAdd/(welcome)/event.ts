import { defineEvent } from "@nectar-js/nectar";

export default defineEvent("guildMemberAdd", async (member) => {
  await member.guild.systemChannel?.send(`Welcome, ${member}!`);
});
