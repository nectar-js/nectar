# Events

Create an `event.ts` under `app/events/<event-name>/` to handle a discord.js event. Use the event name as the first argument to `defineEvent`.

```ts
// app/events/guildMemberAdd/event.ts
import { defineEvent } from "@nectar-js/nectar";

export default defineEvent("guildMemberAdd", async (member) => {
  await member.guild.systemChannel?.send(`Welcome, ${member}!`);
});
```

Event handlers get the discord.js listener arguments and nothing else.

Handlers for the same event run one at a time, sorted by `meta.order` and then by route ID. `meta.mode: "concurrent"` runs them in parallel. `meta.once: true` runs a handler on the first event only.

## Intents

Add the intents your event needs to `nectar.config.ts`. For `guildMemberAdd`, include `"GuildMembers"` and enable the Server Members Intent for your bot in the Discord Developer Portal. Nectar warns when an event needs an intent missing from your config.

## Multiple handlers

Use route groups to handle the same event in separate files:

```text
app/events/guildMemberAdd/
  (welcome)/event.ts
  (audit)/event.ts
```

Both handlers declare `defineEvent("guildMemberAdd", ...)`. Set `meta.order` to control their order. Handlers that set `meta.mode` must agree on the mode.

## Errors and shared code

Event handlers do not run middleware. Import shared code directly, or read plugin services with `services()`. The nearest `error.ts` handles failures, with `interaction` set to `null`. See [Error handling](./errors#event-handlers) and [event metadata](../reference/files#event-ts).
