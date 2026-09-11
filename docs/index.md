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

export default defineCommand("ping", async (ctx) => {
  await ctx.interaction.reply("Pong.");
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

export default defineCommand("moderation/ban", async (ctx) => {
  const target = ctx.interaction.options.getUser("target", true);
  await ctx.interaction.guild?.members.ban(target);
  await ctx.interaction.reply(`Banned ${target.username}.`);
});
```

</template>
<template #close>

```ts
import { defineComponent } from "@nectar-js/nectar";

export default defineComponent("tickets/[ticketId]/close", async (ctx) => {
  await ctx.interaction.update({
    content: `Ticket ${ctx.params.ticketId} closed.`,
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
</Home>
