---
layout: page
sidebar: false
title: Nectar
titleTemplate: A filesystem-based meta-framework for discord.js
---

<script setup>
import Home from "./.vitepress/theme/Home.vue";
</script>

<Home>
<template #ping>

```ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Check that the bot is alive",
};

export default defineCommand("ping", async (interaction) => {
  await interaction.reply("Pong.");
});
```

</template>
<template #ban>

```ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Ban a member",
  options: [
    { type: "user", name: "target", description: "Who to ban", required: true },
  ],
};

export default defineCommand("moderation/ban", async (interaction, { target }) => {
  await interaction.guild?.members.ban(target);
  await interaction.reply(`Banned ${target.username}.`);
});
```

</template>
<template #guard>

```ts
import { requirePermissions } from "@nectar-js/nectar";

export default requirePermissions("BanMembers");
```

</template>
<template #close>

```ts
import { defineComponent } from "@nectar-js/nectar";

export default defineComponent("tickets/[ticketId]/close", async (interaction, params) => {
  await interaction.update({
    content: `Ticket ${params.ticketId} closed.`,
    components: [],
  });
});
```

</template>
<template #welcome>

```ts
import { defineEvent } from "@nectar-js/nectar";

export default defineEvent("guildMemberAdd", async (member) => {
  await member.guild.systemChannel?.send(`Welcome, ${member}!`);
});
```

</template>
<template #translation>

```ts
import { t } from "@nectar-js/i18n";

await interaction.reply(
  t("welcome", { user: "@newcomer" }),
);
```

</template>
</Home>
