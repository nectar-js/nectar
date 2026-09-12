# Middleware and errors

## Middleware

A `middleware.ts` runs before every command, autocomplete, and component handler in its directory and below. Event handlers don't run middleware.

Middleware runs from the root down. For `/moderation ban`, that's:

1. `app/middleware.ts`
2. `app/commands/middleware.ts`
3. `app/commands/moderation/middleware.ts`
4. `app/commands/moderation/ban/command.ts`

Directories without a `middleware.ts` are skipped.

```ts
// app/middleware.ts
import { defineMiddleware } from "@nectar-js/nectar";

export default defineMiddleware(async (interaction) => {
  return { settings: await loadSettings(interaction.guildId) };
});
```

A middleware gets the interaction and returns one of three things:

- A value. Handlers below read it with `use()`, typed from the middleware itself.
- Nothing. The chain continues and there is nothing to read.
- `stop`. Nothing below runs. Reply to the interaction first if the user should see something.

Throwing sends the error to the error boundaries.

```ts
// app/commands/settings/show/command.ts
import { defineCommand, use } from "@nectar-js/nectar";
import settings from "../../../middleware.ts";

export default defineCommand("settings/show", async (interaction) => {
  const { settings: current } = use(settings);
  await interaction.reply(current.summary);
});
```

`use()` takes the middleware module's default export, so the handler imports it. Asking for a middleware that didn't run for the route throws.

`autocomplete.ts` runs the same middleware as its command. If a middleware stops an autocomplete interaction, answer it with `interaction.respond([])` first.

## Policy helpers

`guildOnly`, `requirePermissions`, `requireRoles`, and `cooldown` return middleware you can export from a `middleware.ts`:

```ts
// app/commands/moderation/middleware.ts
import { requirePermissions } from "@nectar-js/nectar";

export default requirePermissions("BanMembers");
```

When the check fails, they reply with an ephemeral message and stop the chain. `requireRoles` passes if the member has any of the roles, or all of them with `{ mode: "all" }`.

`defaultMemberPermissions` only sets who can see a command, and server admins can override it. Enforce permissions in middleware.

## Error boundaries

When a handler or middleware throws, Nectar calls the nearest `error.ts`, then the next one up, ending at `app/error.ts`.

```ts
// app/components/tickets/error.ts
import { defineError } from "@nectar-js/nectar";
import { MessageFlags } from "discord.js";
import { TicketNotFound } from "../../tickets.ts";

export default defineError(async (error, interaction) => {
  if (!(error instanceof TicketNotFound)) return "unhandled";
  if (interaction?.isRepliable()) {
    await interaction.reply({ content: "That ticket is gone.", flags: MessageFlags.Ephemeral });
  }
});
```

Return `"unhandled"` or throw to pass the error to the next boundary. Returning anything else stops it there.

If no boundary handles the error, Nectar logs it and replies with "Something went wrong while handling that." as an ephemeral message, unless the interaction was already answered.

Error boundaries apply to event handlers too. For those, `interaction` is `null`.
