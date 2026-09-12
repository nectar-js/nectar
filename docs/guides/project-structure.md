# Project structure

Nectar reads routes from `app/` in the project root. Set `appDir` in `nectar.config.ts` to use a different directory.

Routes go in three directories:

- `commands/` for slash commands and context menu commands
- `components/` for buttons, select menus, and modals
- `events/` for discord.js events

A root `middleware.ts` applies to commands and components, including autocomplete. A root `error.ts` handles errors from all routes, including events.

```text
app/
  commands/ping/command.ts
  components/tickets/[ticketId]/close/button.ts
  events/guildMemberAdd/event.ts
  middleware.ts
  error.ts
  lib/
nectar.config.ts
```

Keep shared code in ordinary modules such as `app/lib/`. Nectar ignores files that do not use a reserved name.

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
| `[ticketId]` | Parameter, available as `params.ticketId` in the handler |
| `[...path]` | Catch-all parameter, an array of strings. Must be the last segment. |
| `(staff)` | Route group, left out of the route |

Parameters only work under `components/`.

## Write handlers

- [Commands](./commands) covers slash commands, subcommands, context menus, and autocomplete.
- [Components](./components) covers buttons, select menus, and modal submissions.
- [Events](./events) covers discord.js event listeners and multiple handlers for one event.

## Route groups

Groups don't change the route. `commands/(staff)/ban/command.ts` registers `/ban`. A `middleware.ts` or `error.ts` inside a group only applies to routes in that group.

## Route IDs

Every route has an ID: `command:moderation/ban`, `component:tickets/[ticketId]/close`, `event:guildMemberAdd/(welcome)`. Groups are left out, except for events. Logs use these IDs, and a handler can read its own from `route().id`.

## Route strings

Handlers take their path as the first argument:

```ts
// app/commands/moderation/ban/command.ts
export default defineCommand("moderation/ban", async (interaction, options) => {
  // ...
});
```

The generated types use it to type the handler's arguments, and the compiler fails if it doesn't match the file's location. Event handlers take the event name, as in `defineEvent("guildMemberAdd", ...)`.
