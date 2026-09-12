# Interactions

## Commands

Slash commands match by name, subcommand group, and subcommand. `/moderation ban` runs `commands/moderation/ban/command.ts`. Context menu commands match by type and name.

## Autocomplete

`autocomplete.ts` exports one function per option with `autocomplete: true`, named after the option:

```ts
// app/commands/user/profile/autocomplete.ts
import type { InteractionContext } from "@nectar-js/nectar";
import type { AutocompleteInteraction } from "discord.js";

export async function section(ctx: InteractionContext<AutocompleteInteraction>) {
  await ctx.interaction.respond([{ name: "Overview", value: "overview" }]);
}
```

## Components

Buttons, select menus, and modal submits match by custom ID. See [Custom IDs](./custom-ids).

## Events

```ts
// app/events/guildMemberAdd/event.ts
import { defineEvent } from "@nectar-js/nectar";

export default defineEvent("guildMemberAdd", async (member, ctx) => {
  await member.guild.systemChannel?.send(`Welcome, ${member}!`);
});
```

Event handlers get the discord.js listener arguments followed by `ctx`.

Handlers for the same event run one at a time, sorted by `meta.order` and then by route ID. `meta.mode: "concurrent"` runs them in parallel. `meta.once: true` runs a handler on the first event only.

## Context

Command, autocomplete, and component handlers receive `ctx`:

| Field | |
| --- | --- |
| `interaction` | The discord.js interaction |
| `client` | The discord.js client |
| `params` | Component parameters from the custom ID |
| `options` | Command options by name, resolved through discord.js. `null` for options the user left out. Empty for components and autocomplete. |
| `route` | `id`, `category`, `path`, and `file` of the route |
| `env` | `"development"`, `"test"`, or `"production"` |
| `trace` | `id`, `receivedAt`, and `elapsed()`, the milliseconds since Discord created the interaction |
| `services` | Services provided by plugins |

Middleware can add more fields. Event handlers get `client`, `route`, `env`, and `services`.

## Responses

Nectar doesn't reply to or defer interactions. If a handler can take longer than three seconds, call `deferReply()` first.

Nectar only responds itself in three cases:

- An unhandled error gets a generic ephemeral reply, unless the interaction was already answered.
- An autocomplete handler that throws gets an empty list.
- `guildOnly`, `requirePermissions`, and `requireRoles` reply when they reject an interaction.

## Unrouted interactions

Components whose custom ID doesn't start with `n:` are ignored. Commands without a route are logged as a warning and ignored. Handle either yourself in `events/interactionCreate/event.ts`, which receives every interaction.
