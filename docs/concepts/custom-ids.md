# Custom IDs

A component's custom ID comes from its route. For `components/tickets/[ticketId]/close/button.ts`, create the ID with `customId`:

```ts
import { customId } from "@nectar-js/nectar";
import { ButtonBuilder, ButtonStyle } from "discord.js";

const close = new ButtonBuilder()
  .setCustomId(customId("tickets/[ticketId]/close", { ticketId: ticket.id }))
  .setLabel("Close")
  .setStyle(ButtonStyle.Danger);
```

The handler reads the parameter from `ctx.params`:

```ts
// app/components/tickets/[ticketId]/close/button.ts
import { defineComponent } from "@nectar-js/nectar";

export default defineComponent("tickets/[ticketId]/close", async (ctx) => {
  await closeTicket(ctx.params.ticketId);
  await ctx.interaction.update({ content: "Ticket closed.", components: [] });
});
```

With generated types, `customId` only accepts existing routes and requires their parameters. It reads routes from the running bot, so call it from handlers, not at the top level of a module.

## Format

```
n:31imou:42
```

`n:` marks the ID as Nectar's. `31imou` is a six-character hash of the route ID. Parameter values follow in route order, separated by `:`, with `:` and `\` escaped as `\:` and `\\`.

The overhead is 8 characters plus one per parameter. If the ID would exceed Discord's 100 characters, `customId` throws a `CustomIdTooLongError`. Store a key in the custom ID, not the data itself.

Parameters are always strings, and catch-all parameters are arrays of strings.

Renaming a directory or parameter in the route changes the hash, and components on messages sent before the rename stop working. Route groups don't affect it.

## Validation

Nectar rejects a custom ID before middleware runs if it can't be decoded, doesn't match a route of that component type, or has the wrong number of values.

To check parameter values, pass validators to `defineComponent`:

```ts
export default defineComponent("tickets/[ticketId]/close", handler, {
  params: { ticketId: (value) => /^\d+$/.test(value) },
});
```

A validator is a function that returns `false` or throws to reject, or a Standard Schema such as zod, valibot, or ArkType. Rejections are logged without parameter values.

Anyone who can see a component can send its custom ID with different values. Check that the user is allowed to act on the record in your handler or middleware, and don't put secrets in custom IDs.

## Other custom IDs

Nectar ignores custom IDs that don't start with `n:`, so components you create by hand keep working.
