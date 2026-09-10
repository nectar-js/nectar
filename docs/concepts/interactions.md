# Interactions

When Discord sends an interaction, Nectar finds the route for it, builds a context object, runs the route's middleware, and calls the handler. This page covers finding the route and what the handler receives. [Middleware and errors](./middleware-and-errors) covers the rest.

## From interaction to file

| Discord sends | Nectar runs |
| --- | --- |
| `/ping` | `commands/ping/command.ts` |
| `/moderation ban` | `commands/moderation/ban/command.ts` |
| `/settings roles add` | `commands/settings/roles/add/command.ts` |
| A user or message context menu command | The top-level `command.ts` with that name and `meta.type` |
| Autocomplete for the `section` option of `/user profile` | The `section` export of `commands/user/profile/autocomplete.ts` |
| A button click, select menu choice, or modal submission | The `button.ts`, `select.ts`, or `modal.ts` whose route the custom ID names |

Commands match by name. Discord sends the command name along with the subcommand group and subcommand, and Nectar looks those up in a table built from the manifest.

Components match by custom ID. Discord sends back the custom ID the bot put on the component, and Nectar decodes the route and its parameters from it. [Custom IDs](./custom-ids) covers the format.

## Events

Events come from discord.js, not from the interaction flow. Nectar attaches one listener for each event that has routes and calls every `event.ts` for that event:

```ts
// app/events/guildMemberAdd/(welcome)/event.ts
import { defineEvent } from "@nectar-js/nectar";

export default defineEvent("guildMemberAdd", async (member, ctx) => {
  await member.guild.systemChannel?.send(`Welcome, ${member}!`);
});
```

The handler gets the arguments a discord.js listener would, plus a context object at the end.

By default the handlers of one event run one after another, sorted by `meta.order` and then by route ID. `mode: "concurrent"` starts them all at once instead. All handlers of an event share one mode, so set it in one file. `once: true` runs a handler for the first emission only.

```ts
export const meta = { order: 1, once: true };
```

## The context object

Command, autocomplete, and component handlers receive one argument, `ctx`:

| Field | What it holds |
| --- | --- |
| `interaction` | The discord.js interaction, typed for the route: `ChatInputCommandInteraction` in a slash command, `ButtonInteraction` in a button, and so on. |
| `client` | The discord.js `Client`. |
| `params` | The component route's parameters, decoded from the custom ID. Empty for commands. |
| `route` | The route's `id`, `category`, `path`, and absolute `file`. |
| `env` | `"development"`, `"test"`, or `"production"`. |
| `trace` | `id` is the interaction ID, `receivedAt` is when Nectar received it, and `elapsed()` returns the milliseconds since Discord created it. |
| `services` | What plugins provide. Empty without plugins. |

Middleware can add fields. Event handlers get a smaller context with `client`, `route`, `env`, and `services`.

## Responding is up to you

Nectar doesn't reply to, defer, or acknowledge interactions on its own. Discord gives the bot three seconds to respond before it shows the user an error. If a handler can take longer, call `ctx.interaction.deferReply()` first. `ctx.trace.elapsed()` tells you how much of that time has gone.

Nectar answers in three cases:

- An error that no `error.ts` handles gets a generic ephemeral reply, if nothing has answered the interaction yet.
- An autocomplete handler that throws gets an empty list, so Discord stops loading.
- The opt-in policy middleware, `guildOnly`, `requirePermissions`, and `requireRoles`, replies when it turns an interaction away.

## What Nectar leaves alone

- A button, select menu, or modal whose custom ID doesn't start with `n:` isn't Nectar's. Components you build by hand keep working.
- A command with no route, such as one still registered from an older version of the bot, is dropped with a warning that suggests running `nectar sync`.
- Interaction types Nectar doesn't route are dropped.

To handle any of these yourself, add `events/interactionCreate/event.ts`. It receives every interaction, including the ones Nectar routes.
