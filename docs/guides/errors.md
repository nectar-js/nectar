# Error handling

When a handler or middleware throws, Nectar passes the error to the nearest `error.ts`, then to each one above it, then to its default boundary. The default boundary logs the error and, if the interaction hasn't been answered, replies with an ephemeral "Something went wrong while handling that."

## Handling an error

Put an `error.ts` next to the routes that throw the error, and let everything else through:

```ts
// app/components/tickets/error.ts
import { defineError } from "@nectar-js/nectar";
import { MessageFlags } from "discord.js";
import { TicketNotFound } from "../../tickets.ts";

export default defineError(async (error, ctx) => {
  if (!(error instanceof TicketNotFound)) return "unhandled";
  if (!("interaction" in ctx) || !ctx.interaction.isRepliable()) return;

  const message = {
    content: "That ticket no longer exists.",
    flags: MessageFlags.Ephemeral,
  } as const;
  if (ctx.interaction.replied || ctx.interaction.deferred) {
    await ctx.interaction.followUp(message);
  } else {
    await ctx.interaction.reply(message);
  }
});
```

Returning `"unhandled"` passes the error up. Returning anything else, or nothing, marks it handled. If the boundary throws, the new error goes up instead.

The handler may have replied or deferred before it threw, so check `replied` and `deferred` before answering.

## Reporting errors

To send every unhandled error to a tracker, report it in `app/error.ts` and pass it on, so the default boundary still logs it and answers the user:

```ts
// app/error.ts
import { defineError } from "@nectar-js/nectar";
import { report } from "./lib/report.ts";

export default defineError(async (error, ctx) => {
  report(error, ctx.route.id);
  return "unhandled";
});
```

To also see errors that a boundary handled, use `observe` in the config. `interaction:fail` and `event:fail` carry the error and the `boundary` that handled it, or `null` if none did.

## Event handlers

Error boundaries cover event handlers the same way. Their `ctx` has `client`, `route`, `env`, and `services`, and no `interaction`. Errors from event handlers never reach the client's `error` event.

## Autocomplete

If an autocomplete handler throws, Nectar answers with an empty list after the boundaries run, unless something already responded.

## Default boundary output

In development, the log shows the route, file, interaction, time since Discord created it, middleware chain, and stack. In production and test, it's one line with the route ID and file, followed by the error.
