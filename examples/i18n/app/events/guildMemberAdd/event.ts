import { translator } from "@nectar-js/i18n";
import { defineEvent } from "@nectar-js/nectar";

export default defineEvent("guildMemberAdd", async (member) => {
  // An event has no reader to follow, so the server's own language is the closest thing.
  const t = translator(member.guild.preferredLocale);
  await member.guild.systemChannel?.send(
    t("welcome", { guild: member.guild.name, user: member.toString() }),
  );
});
