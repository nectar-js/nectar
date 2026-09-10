# The app directory

Everything Nectar routes lives in `app/` at the project root. Set `appDir` in `nectar.config.ts` to use another directory.

`app/` has three areas, one for each kind of thing Discord sends:

- `commands/` for slash commands and context menu commands.
- `components/` for buttons, select menus, and modals.
- `events/` for discord.js client events.

A `middleware.ts` or `error.ts` directly in `app/` applies to all three areas. Every other reserved file has to be inside one of them. `app/command.ts` and `app/lib/command.ts` are both compile errors.

## Reserved files

Nectar only looks at files with these names. Any other file is ordinary code that Nectar ignores, wherever it is, so a helper can sit next to the handler that uses it.

| File | What it is |
| --- | --- |
| `command.ts` | A slash command, subcommand, or context menu command. |
| `autocomplete.ts` | Autocomplete for the options of the `command.ts` next to it. |
| `route.ts` | The description of a command that has subcommands, or of a subcommand group. |
| `button.ts` | A button. |
| `select.ts` | A select menu. |
| `modal.ts` | A modal submission. |
| `event.ts` | A handler for one discord.js event. |
| `middleware.ts` | Runs before every handler in its directory and below. |
| `error.ts` | Handles errors thrown in its directory and below. |

Each name also works with `.js`, `.mts`, and `.mjs`. Test files such as `command.test.ts` are ignored.

## Directory names

The directories between the area and the file make up the route's path. A directory name can be one of four kinds:

| Directory | Meaning |
| --- | --- |
| `ban/` | A static segment. It becomes part of the command name or the custom ID. |
| `[ticketId]/` | A parameter. The custom ID carries a value in this position, and the handler reads it as `ctx.params.ticketId`. |
| `[...path]/` | A catch-all parameter. It takes any number of values and must come last. |
| `(staff)/` | A route group. It organizes files and scopes middleware without appearing in the route. |

Only component routes take parameters. `[param]` under `commands/` or `events/` is a compile error.

## Commands

A `command.ts` is a command, and its path is the command's name. Up to three levels map onto Discord's commands, subcommand groups, and subcommands:

```
commands/ping/command.ts                  /ping
commands/moderation/ban/command.ts        /moderation ban
commands/settings/roles/add/command.ts    /settings roles add
```

Discord can't run `/moderation` on its own once it has subcommands, so `moderation/` can't have a `command.ts` of its own. It needs a `route.ts` instead, exporting the description Discord shows for `/moderation` and any settings for the whole command, such as `defaultMemberPermissions`. A subcommand group like `settings/roles/` needs a `route.ts` with a description too.

A user or message context menu command is a top-level command, like `commands/report/command.ts`, with `meta.type` set to `"user"` or `"message"`. Context menu names can have spaces and capitals, which directory names can't. Set `meta.name` for a name like `"Report message"`.

## Components

A `button.ts`, `select.ts`, or `modal.ts` handles that kind of component. Its path is what the custom ID encodes:

```
components/tickets/[ticketId]/close/button.ts     closes one ticket
components/tickets/[ticketId]/assign/select.ts    assigns it to a member
components/pagination/[page]/next/button.ts       shows the next page
```

A button and a modal can share a directory. That suits a button that opens a modal, since both carry the same parameters.

## Events

An `event.ts` in `events/<name>/` runs when discord.js emits that event. The name is a value of discord.js's `Events` enum, such as `messageCreate` or `guildMemberAdd`. The compiler rejects names discord.js doesn't emit, and it points out the right spelling for mistakes like `GuildMemberAdd` or the renamed `ready`.

To give one event several handlers, put each one in a route group:

```
events/guildMemberAdd/(welcome)/event.ts
events/guildMemberAdd/(audit)/event.ts
```

## Route groups

A route group doesn't change the route. `commands/(staff)/ban/command.ts` is `/ban`, the same as `commands/ban/command.ts`.

Use groups to split a large `app/` by feature or by team, and to give a set of routes their own middleware. A `middleware.ts` inside `(staff)/` runs only for the routes in that group.

## Route IDs

Every route has an ID made of its area and its path:

```
command:moderation/ban
component:tickets/[ticketId]/close
event:guildMemberAdd/(welcome)
```

Groups are left out, except under `events/`, where they tell the handlers of one event apart. Logs and error reports name routes by this ID, and handlers can read it as `ctx.route.id`.

## The route string

Each handler repeats its path as the first argument:

```ts
// app/commands/moderation/ban/command.ts
export default defineCommand("moderation/ban", async (ctx) => {
  // ...
});
```

TypeScript uses the string to look up the handler's types: its options, its parameters, and whatever its middleware adds to `ctx`. The compiler checks that the string matches the file's location, so moving a file means editing the string. Event handlers pass the event name, as in `defineEvent("guildMemberAdd", ...)`.
