# Middleware and errors

A `middleware.ts` runs before every handler in its directory and the directories below it. An `error.ts` handles errors thrown in its directory and below. A file's location is the only thing that decides what it covers.

## Middleware scope

```
app/
├── middleware.ts                         every command, autocomplete, and component
├── commands/
│   ├── middleware.ts                     every command and its autocomplete
│   ├── ping/command.ts
│   └── moderation/
│       ├── middleware.ts                 /moderation ban and /moderation kick
│       ├── ban/command.ts
│       └── kick/command.ts
└── components/
    └── tickets/
        ├── middleware.ts                 every ticket component
        └── [ticketId]/close/button.ts
```

For `/moderation ban`, the middleware runs from the root down, then the handler:

1. `app/middleware.ts`
2. `app/commands/middleware.ts`
3. `app/commands/moderation/middleware.ts`
4. `app/commands/moderation/ban/command.ts`

The compiler works out this list for every route and stores it in the manifest. `nectar manifest --route command:moderation/ban` prints it.

A route group counts as a directory here. `commands/(staff)/middleware.ts` covers the commands inside `(staff)/`, and their names stay the same.

Middleware runs for commands, autocomplete, and components. Event handlers don't go through middleware.

## Writing middleware

A middleware receives the handler's context and a `next` function:

```ts
// app/middleware.ts
import { defineMiddleware } from "@nectar-js/nectar";

export default defineMiddleware(async (ctx, next) => {
  const settings = await loadSettings(ctx.interaction.guildId);
  return next({ settings });
});
```

What it does with `next` decides what happens below it:

- `return next()` moves on to the next middleware, or to the handler.
- `return next({ settings })` moves on and adds `settings` to the context of everything below. Handlers see `ctx.settings` with the type you passed.
- Returning without calling `next` stops the chain, and the handler never runs. Answer the interaction first if the user should see something.
- Throwing sends the error to the error boundaries.

Code after `await next()` runs once the handler has finished:

```ts
export default defineMiddleware(async (ctx, next) => {
  const started = Date.now();
  await next();
  console.log(`${ctx.route.id} took ${Date.now() - started}ms`);
});
```

An `autocomplete.ts` runs the same middleware as the command next to it. A middleware that stops an autocomplete interaction should answer it with `ctx.interaction.respond([])`, or the user sees the options fail to load. `ctx.interaction.isAutocomplete()` tells the two apart.

## Policy helpers

Nectar exports three middleware for common checks. Export one from a `middleware.ts` to apply it to that directory:

```ts
// app/commands/moderation/middleware.ts
import { requirePermissions } from "@nectar-js/nectar";

export default requirePermissions("BanMembers");
```

`guildOnly()` lets through interactions from a server. `requirePermissions(permissions)` lets through members who have those permissions in the channel. `requireRoles(roleIds)` lets through members with any of the roles, or with all of them when you pass `{ mode: "all" }`. A failed check answers with a short ephemeral message and stops the chain. Nectar applies none of them unless you export one.

`defaultMemberPermissions` on a command is a separate thing. It tells Discord who sees the command, and server admins can change it per role and per channel. A check that has to hold belongs in middleware.

## Error boundaries

When a handler or middleware throws, Nectar hands the error to the nearest `error.ts` above the route, then the next one up. For `/moderation ban`, that order is:

1. `app/commands/moderation/error.ts`
2. `app/commands/error.ts`
3. `app/error.ts`
4. Nectar's default boundary

Only the files that exist take part. An error boundary decides what happens by how it returns:

```ts
// app/components/tickets/error.ts
import { defineError } from "@nectar-js/nectar";
import { MessageFlags } from "discord.js";
import { TicketNotFound } from "../../tickets.ts";

export default defineError(async (error, ctx) => {
  if (!(error instanceof TicketNotFound)) return "unhandled";
  if ("interaction" in ctx && ctx.interaction.isRepliable()) {
    await ctx.interaction.reply({ content: "That ticket is gone.", flags: MessageFlags.Ephemeral });
  }
});
```

- Returning `"unhandled"` passes the error to the next boundary up.
- Throwing passes the new error up instead.
- Returning anything else, or nothing, marks the error handled. The boundaries above it don't run.

The default boundary logs the error with the route ID and file. If nothing has answered the interaction, it also replies with an ephemeral "Something went wrong while handling that." Every error ends up either handled by an `error.ts` or in the log.

Error boundaries also cover event handlers, with the same scope rules. `app/error.ts` covers every route, and `app/events/error.ts` covers every event handler. An event handler's context has no `interaction`, which is why the example above checks for one.
