# Middleware

A `middleware.ts` runs before every command, autocomplete, and component handler in its directory and below. Event handlers don't run middleware.

Middleware runs from the root down. For `/moderation ban`, that's:

1. `app/middleware.ts`
2. `app/commands/middleware.ts`
3. `app/commands/moderation/middleware.ts`
4. `app/commands/moderation/ban/command.ts`

Directories without a `middleware.ts` are skipped.

Return a value to share it with handlers through `use()`. Return `stop` to skip the remaining middleware and handler. Throw to pass an error to the nearest [error boundary](./errors).

## Passing values to handlers

A middleware returns a value, and every handler below reads it with `use()`:

```ts
// app/commands/moderation/middleware.ts
import { defineMiddleware, stop } from "@nectar-js/nectar";
import { MessageFlags } from "discord.js";

export default defineMiddleware(async (interaction) => {
  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    }
    return stop;
  }
  return { member: interaction.member };
});
```

```ts
// app/commands/moderation/ban/command.ts
import { defineCommand, use } from "@nectar-js/nectar";
import guard from "../middleware.ts";

export default defineCommand("moderation/ban", async (interaction) => {
  const { member } = use(guard);
  await interaction.reply(`${member.displayName} is banning someone.`);
});
```

`use(guard)` is `{ member: GuildMember }` because that is what the middleware returns. TypeScript takes `stop` out of the union, so nothing else is needed. Import the middleware whose value you need. Calling `use()` for middleware that did not run throws.

A middleware can read the ones above it the same way:

```ts
// app/commands/moderation/ban/middleware.ts
import { defineMiddleware, stop, use } from "@nectar-js/nectar";
import guard from "../middleware.ts";

export default defineMiddleware(async () => {
  if (!use(guard).member.permissions.has("BanMembers")) return stop;
});
```

There is no hook after the handler. For timings, subscribe to the `handler:complete` signal in `observe`.

## The interaction type

In middleware, `interaction` is any interaction the route can receive. Use the discord.js type guards, like `inCachedGuild()`, `isChatInputCommand()`, or `isAutocomplete()`, before using interaction-specific methods.

A middleware that stops an autocomplete interaction should still answer it:

```ts
if (interaction.isAutocomplete()) {
  await interaction.respond([]);
  return stop;
}
```

## Policy helpers

Nectar exports four middleware for common checks. Export one as a directory's `middleware.ts`:

```ts
// app/commands/moderation/middleware.ts
import { requirePermissions } from "@nectar-js/nectar";

export default requirePermissions(["BanMembers", "KickMembers"]);
```

| Helper | Lets the interaction through when |
| --- | --- |
| `guildOnly(options?)` | It comes from a server |
| `requirePermissions(permissions, options?)` | The member has the permissions in the channel |
| `requireRoles(roleIds, options?)` | The member has one of the roles, or all of them with `mode: "all"` |
| `cooldown(seconds, options?)` | The user hasn't run the route in the last `seconds` |

`defaultMemberPermissions` sets default command permissions, which server admins can override. Use middleware to enforce permissions when the command runs.

If a helper rejects an interaction, it replies with an ephemeral message and stops the chain. Set `message` in the options to change the reply.

`cooldown` counts per route, so a `middleware.ts` with `cooldown(30)` over ten commands gives each command its own timer. `scope: "guild"` shares the timer between everyone in a server, and `scope: "global"` between everyone. `message` can be a function of the seconds left. Autocomplete is never held back. Timers live in memory, so they reset when the bot restarts and aren't shared between shards.

See [Handler context](../reference/handler-context) for `client()`, `route()`, and other helpers available in middleware.
