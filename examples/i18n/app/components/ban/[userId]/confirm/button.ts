import { t } from "@nectar-js/i18n";
import { defineComponent } from "@nectar-js/nectar";
import { banCount, recordBan } from "../../../../bans.ts";

export default defineComponent("ban/[userId]/confirm", async (interaction, { userId }) => {
  const user = `<@${userId}>`;
  const before = banCount(userId);
  recordBan(userId);
  await interaction.update({
    content: `${t("ban.done", { user })}\n${t("ban.history", { user, count: before })}`,
    components: [],
  });
});
