# Middleware

## Adding to the context

Pass an object to `next` and every handler below gets its fields, with types:

```ts
// app/commands/moderation/middleware.ts
import { defineMiddleware } from "@nectar-js/nectar";
import { MessageFlags } from "discord.js";

export default defineMiddleware(async (ctx, next) => {
  if (!ctx.interaction.inCachedGuild()) {
    if (ctx.interaction.isRepliable()) {
      await ctx.interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    }
    return;
  }
  return next({ member: ctx.interaction.member });
});
```

```ts
// app/commands/moderation/ban/command.ts
export default defineCommand("moderation/ban", async (ctx) => {
  await ctx.interaction.reply(`${ctx.member.displayName} is banning someone.`);
});
```

`ctx.member` is a `GuildMember` in every command under `moderation/`. The types come from `.nectar/types.d.ts`, which `nectar dev` and `nectar build` regenerate.

TypeScript infers the added fields from the value you return, so return the result of `next`. To run code after the handler, keep the result and return it at the end:

```ts
// app/components/middleware.ts
export default defineMiddleware(async (ctx, next) => {
  const clickedAt = Date.now();
  const result = await next({ clickedAt });
  console.log(`${ctx.route.id} took ${Date.now() - clickedAt}ms`);
  return result;
});
```

Or pass the type explicitly:

```ts
export default defineMiddleware<{ locale: string }>(async (ctx, next) => {
  await next({ locale: ctx.interaction.locale });
});
```

A middleware's own `ctx` isn't typed with fields added by middleware above it. The values are there at runtime, and handlers see all of them typed.

## The interaction type

In middleware, `ctx.interaction` is any interaction the route can receive. Use the discord.js type guards, like `inCachedGuild()`, `isChatInputCommand()`, or `isAutocomplete()`, before using interaction-specific methods.

A middleware that stops an autocomplete interaction should still answer it:

```ts
if (ctx.interaction.isAutocomplete()) {
  await ctx.interaction.respond([]);
  return;
}
```

## Policy helpers

Nectar exports three middleware for common checks. Export one as a directory's `middleware.ts`:

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

Otherwise they reply with an ephemeral message and stop the chain. Set `message` in the options to change the reply.
