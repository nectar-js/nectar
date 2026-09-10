# Custom IDs

Discord stores a custom ID on every button, select menu, and modal the bot sends, and sends it back when someone uses the component. It's a string of up to 100 characters, and Discord doesn't care what's in it. Bots without a framework usually build strings like `ticket-close-42` by hand and split them apart again in a switch statement.

In Nectar, a component's route is its custom ID format. This file handles the close button of one ticket:

```
app/components/tickets/[ticketId]/close/button.ts
```

To send that button, ask for its ID with the ticket's value:

```ts
import { customId } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const close = new ButtonBuilder()
  .setCustomId(customId("tickets/[ticketId]/close", { ticketId: ticket.id }))
  .setLabel("Close")
  .setStyle(ButtonStyle.Danger);

await ctx.interaction.reply({
  content: `Ticket ${ticket.id} is open.`,
  components: [new ActionRowBuilder<ButtonBuilder>().addComponents(close)],
});
```

When someone clicks it, the handler gets the value back:

```ts
// app/components/tickets/[ticketId]/close/button.ts
import { defineComponent } from "@nectar-js/nectar";

export default defineComponent("tickets/[ticketId]/close", async (ctx) => {
  await closeTicket(ctx.params.ticketId);
  await ctx.interaction.update({ content: "Ticket closed.", components: [] });
});
```

One route defines both the ID you send and the way it's parsed, so the two can't drift apart. With the generated types, `customId` rejects a path that doesn't exist and a missing or misspelled parameter.

`customId` returns a plain string, so it works with any discord.js builder or raw component object. Nectar has no component API of its own. It looks the route up in the running bot's manifest, so call it from handlers and not at the top level of a module.

## The format

```
n:31imou:42
```

- `n:` marks the ID as Nectar's.
- `31imou` is the route's short ID, a six-character hash of the route ID `component:tickets/[ticketId]/close`.
- `42` is the `ticketId` value. With several parameters, the values follow in route order, separated by `:`. A `:` or `\` inside a value is escaped with a `\`.

The path itself isn't in the ID, only its hash, so a long path costs nothing. Nectar takes eight characters plus one per parameter, and the rest of Discord's 100 is left for values. `nectar routes` shows each component's pattern, such as `n:31imou:<ticketId>`.

## When IDs change

The short ID comes from the route path. Renaming or moving a directory changes it, and so does renaming a parameter. Messages sent before the change still carry the old ID, and Nectar drops clicks on them because the short ID no longer names a route.

Editing the handler doesn't change the ID. Neither does adding a route group or moving the file into one.

## Values are strings

Every parameter arrives as a string, exactly as it was encoded. Convert numbers yourself:

```ts
const page = Number(ctx.params.page);
```

A catch-all parameter such as `[...path]` holds an array of strings, and `customId` takes an array for it.

## Keep IDs short

If the encoded ID would pass 100 characters, `customId` throws a `CustomIdTooLongError`. It never truncates. Put an identifier in the ID, like a database key, and load the rest when the interaction comes back. Catch-all parameters make this easy to hit, so the compiler warns about every route that has one.

## Custom IDs are user input

Anyone who can see a message can read its custom IDs, and a modified client can send any string in their place. Nectar checks every incoming ID before your code runs:

- The ID has to decode, with a valid short ID and valid escapes.
- The short ID has to belong to a route of the kind that arrived. A button click needs a `button.ts` at that path, a modal submission a `modal.ts`.
- The number of values has to match the route's parameters.

Past that, a value can be any string. Declare validators for parameters that need a stricter shape:

```ts
export default defineComponent(
  "tickets/[ticketId]/close",
  async (ctx) => {
    // ctx.params.ticketId is all digits here
  },
  { params: { ticketId: (value) => /^\d+$/.test(value) } },
);
```

A validator is a function or a Standard Schema, such as a zod, valibot, or ArkType schema. A function fails by returning `false` or throwing. A schema only passes or fails the value, and the handler still gets the original string.

When a check fails, Nectar drops the interaction before middleware runs and logs a warning. Parameter values never reach the logs. A Nectar custom ID shows up there as `n:31imou:*`, and a failed validator is reported by the parameter's name.

## A valid ID is not permission

A valid ID only proves the string has the right shape. Someone who can see the close button for ticket 41 can send the ID for ticket 42. Load the record and check who is asking, in the handler or in a middleware above it.

For the same reason, never put a secret or another user's private data in a custom ID.

## IDs Nectar didn't make

Nectar ignores any ID that doesn't start with `n:`. Components built by hand or by another library keep working, and you can handle them in `events/interactionCreate/event.ts`.
