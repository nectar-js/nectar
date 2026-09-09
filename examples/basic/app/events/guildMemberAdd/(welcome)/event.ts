import { defineEvent } from "@neatjs/core";

export default defineEvent("guildMemberAdd", async (member) => {
  await member.guild.systemChannel?.send(`Welcome, ${member}!`);
});
