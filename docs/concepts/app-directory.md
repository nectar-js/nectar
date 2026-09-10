# The app directory

Nectar reads routes from `app/` in the project root. Set `appDir` in `nectar.config.ts` to use a different directory.

Routes go in three directories:

- `commands/` for slash commands and context menu commands
- `components/` for buttons, select menus, and modals
- `events/` for discord.js events

A `middleware.ts` or `error.ts` directly in `app/` applies to all of them.

## Reserved files

Nectar only reads files with these names and ignores everything else.

| File | Purpose |
| --- | --- |
| `command.ts` | Slash command, subcommand, or context menu command |
| `autocomplete.ts` | Autocomplete for the `command.ts` in the same directory |
| `route.ts` | Description of a parent command or subcommand group |
| `button.ts` | Button handler |
| `select.ts` | Select menu handler |
| `modal.ts` | Modal submit handler |
| `event.ts` | Event handler |
| `middleware.ts` | Middleware for its directory and everything below |
| `error.ts` | Error boundary for its directory and everything below |

`.js`, `.mts`, and `.mjs` work too. Test files like `command.test.ts` are ignored.

## Directory names

| Name | Meaning |
| --- | --- |
| `ban` | Static segment |
| `[ticketId]` | Parameter, available as `ctx.params.ticketId` |
| `[...path]` | Catch-all parameter, an array of strings. Must be the last segment. |
| `(staff)` | Route group, left out of the route |

Parameters only work under `components/`.

## Commands

`commands/ping/command.ts` registers `/ping`. Nesting adds subcommands and subcommand groups, up to three levels. `commands/moderation/ban/command.ts` is `/moderation ban`, and `commands/settings/roles/add/command.ts` is `/settings roles add`.

A command with subcommands can't have its own `command.ts`. Give it a `route.ts` with a description instead. Settings for the whole command, like `defaultMemberPermissions`, go there too.

```ts
// app/commands/moderation/route.ts
import type { CommandRouteMeta } from "@nectar-js/nectar";

export const meta: CommandRouteMeta = {
  description: "Moderation tools",
};
```

Subcommand groups need a `route.ts` with a description as well.

For a context menu command, set `meta.type` to `"user"` or `"message"` in a top-level `command.ts`. Set `meta.name` if the name needs spaces or capital letters.

## Components

`button.ts`, `select.ts`, and `modal.ts` handle components. The path, including its parameters, is encoded into the component's custom ID. See [Custom IDs](./custom-ids).

`components/tickets/[ticketId]/close/button.ts` handles a button with a `ticketId` parameter.

## Events

`events/messageCreate/event.ts` runs on discord.js's `messageCreate` event. The directory name has to be a value of discord.js's `Events` enum.

To handle one event in several files, put each in a route group, like `events/guildMemberAdd/(welcome)/event.ts` and `events/guildMemberAdd/(audit)/event.ts`.

## Route groups

Groups don't change the route. `commands/(staff)/ban/command.ts` registers `/ban`. A `middleware.ts` or `error.ts` inside a group only applies to routes in that group.

## Route IDs

Every route has an ID: `command:moderation/ban`, `component:tickets/[ticketId]/close`, `event:guildMemberAdd/(welcome)`. Groups are left out, except for events. Logs use these IDs, and a handler can read its own from `ctx.route.id`.

## Route strings

Handlers take their path as the first argument:

```ts
// app/commands/moderation/ban/command.ts
export default defineCommand("moderation/ban", async (ctx) => {
  // ...
});
```

The generated types use it to type `ctx`, and the compiler fails if it doesn't match the file's location. Event handlers take the event name, as in `defineEvent("guildMemberAdd", ...)`.
