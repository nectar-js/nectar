# Diagnostics

`nectar check`, `nectar build`, and `nectar dev` print a diagnostic for each problem they find in `app/`, with its code, the file, and a link to its entry on this page. An error fails the build. In `nectar dev`, the previous routes keep running until it's fixed. A warning doesn't stop anything.

Plugins can report their own codes, which aren't listed here.

## Files and directories

### file-outside-category

A route file is directly in `app/`. Only `middleware.ts` and `error.ts` can go there. Move the file under `commands/`, `components/`, or `events/`.

### unknown-category

A file with a reserved name, like `command.ts` or `error.ts`, is in a top-level directory other than `commands/`, `components/`, or `events/`. Nectar reads every file with a reserved name as a route file, so a helper at `app/lib/error.ts` triggers this too. Move the file, or rename it if it isn't a route. See [Reserved files](./files).

### file-in-wrong-category

A handler is under the wrong directory, like a `button.ts` under `commands/`. `command.ts` and `autocomplete.ts` go under `commands/`, `button.ts`, `select.ts`, and `modal.ts` go under `components/`, and `event.ts` goes under `events/`.

### invalid-segment

A directory name can't be read as part of a route path. Static names use letters, digits, hyphens, and underscores, and start with a letter or digit. Parameters look like `[ticketId]` and catch-alls like `[...path]`. Their names become keys of `ctx.params`, so they can't start with a digit or contain hyphens. Groups look like `(staff)`. See [Directory names](../concepts/app-directory#directory-names).

### route-without-path

The file has no named directory above it, so it has no route path. That happens when it's directly in `commands/`, `components/`, or `events/`, or only inside route groups, which aren't part of the path. Put it in a named directory, like `commands/ping/command.ts`. For events, the name is the event, as in `events/messageCreate/(logging)/event.ts`.

### dynamic-segment-not-allowed

A command or event path has a parameter like `[id]`. Only component routes can have parameters. Discord registers commands under fixed names, so take input from users with `meta.options`. Event directories are named after the discord.js event.

### duplicate-param

A component route uses one parameter name twice, like `components/[id]/items/[id]/button.ts`. Each parameter becomes a key of `ctx.params`, so rename one of them.

### catch-all-not-last

A catch-all like `[...path]` has more directories after it. It takes every remaining value in the custom ID, so it has to be the last segment. Use `[path]` if it only needs one value.

### duplicate-route

Two files handle the same route. Usually they're in directories that differ only by a route group, like `commands/ping/` and `commands/(admin)/ping/`, since groups aren't part of the path. It also happens with a `command.ts` and a `command.js` in one directory.

For components, it also covers two handlers in one directory, like a `button.ts` next to a `modal.ts`. `customId()` and the generated types find a component by its path alone, so each path gets one handler.

### module-load-failed

The compiler imports every route file to read exports like `meta`, and this one threw. The message has the error. Syntax Node can't strip, like an `enum`, fails here, and so does top-level code that needs something the build doesn't have, like a database connection. Move that kind of code into the handler.

### route-mismatch

The route string passed to `defineCommand`, `defineComponent`, or `defineEvent` doesn't match where the file is. The string types `ctx`, so it has to match. Change the string, or move the file.

## Commands

### missing-meta

A `command.ts` or `route.ts` doesn't export `meta`. Discord needs a description for every slash command, parent command, and subcommand group:

```ts
export const meta: CommandMeta = { description: "Ban a member" };
```

A context menu command sets `type` instead, as in `{ type: "user" }` or `{ type: "message" }`.

### invalid-meta

A field of `meta` has the wrong type or value, and the message names it. That includes `type`, the localizations, `defaultMemberPermissions`, `nsfw`, `contexts`, `integrationTypes`, and the `meta` of an `event.ts`. Context menu commands can't have a description or options. See [command.ts](./files#command-ts) and [event.ts](./files#event-ts).

### invalid-name

A command, subcommand, group, or option name breaks Discord's rules. Slash command and option names are 1 to 32 lowercase letters, digits, hyphens, and underscores. Context menu command names can be up to 32 of any character, so they can have spaces and capitals.

Command names come from the directory unless `meta.name` is set, so rename the directory or set `meta.name`.

### invalid-description

A description is missing, empty, or over 100 characters. Discord needs 1 to 100 for commands, subcommands, groups, and options.

### invalid-option

An entry in `meta.options` breaks one of Discord's rules for options. The message names the option and the field. Common causes:

- more than 25 options, or more than 25 `choices`
- a required option after an optional one
- two options with the same name
- a field on the wrong option type, like `minLength` on an `"integer"` option
- `choices` and `autocomplete: true` on the same option

See [Options](./files#options).

### missing-route-meta

A command or subcommand group has subcommands but no `route.ts`. Discord needs a description for it, and since it has no `command.ts`, that goes in `route.ts`:

```ts
// app/commands/moderation/route.ts
export const meta: CommandRouteMeta = { description: "Moderation tools" };
```

### route-meta-without-path

A `route.ts` isn't inside any command's directory. It's directly in `commands/`, or only inside route groups there. Move it into the directory of the command it describes.

### unused-route-meta

Warning. A `route.ts` has no subcommands below it, so nothing reads it. A plain command's `meta` goes in its `command.ts`. Delete the `route.ts`, or add subcommands.

### mixed-command-and-subcommands

A command has a `command.ts` and subcommand directories below it. Discord doesn't let a command with subcommands run by itself. Replace the `command.ts` with a `route.ts` that has the description, or move the subcommands to another command.

### mixed-subcommand-and-group

A name is both a subcommand and a subcommand group, like `commands/settings/roles/command.ts` next to `commands/settings/roles/add/command.ts`. Discord doesn't allow that. Move the `command.ts` into its own directory under `roles/`, or move the nested subcommands out.

### command-too-deep

A command is nested more than three levels, not counting route groups. Discord allows a command, a subcommand group, and a subcommand, like `/settings roles add`.

### too-many-subcommands

A command has more than 25 subcommands and groups, or a group has more than 25 subcommands. That's Discord's limit. Split them across groups or commands.

### context-menu-nested

A `command.ts` with `meta.type` set to `"user"` or `"message"` is nested inside another command. Discord doesn't have context menu subcommands. Move it to its own directory directly under `commands/`.

### top-level-field-on-group

A subcommand group's `route.ts` sets `defaultMemberPermissions`, `nsfw`, `contexts`, or `integrationTypes`. Discord applies those to the whole command, so set them in the `route.ts` of the top-level command.

### top-level-field-on-subcommand

Like [top-level-field-on-group](#top-level-field-on-group), for a subcommand's `command.ts`.

### duplicate-command-name

Two commands of the same type register the same name, usually because of `meta.name`. Discord needs names to be unique within a type, so a slash command and a user context menu command can share one.

## Autocomplete

### autocomplete-without-command

An `autocomplete.ts` has no `command.ts` in the same directory. It answers the options of that command, so it has to sit next to it.

### autocomplete-export-not-function

An export of `autocomplete.ts` isn't a function. Every named export answers the option with the same name, so keep other exports in a separate file.

### autocomplete-unknown-option

An export of `autocomplete.ts` doesn't match an option with `autocomplete: true` in the command. Rename the export, or set `autocomplete: true` on the option.

### autocomplete-missing-handler

An option has `autocomplete: true`, but `autocomplete.ts` doesn't export a function with its name. See [autocomplete.ts](./files#autocomplete-ts).

### autocomplete-missing-file

A command has options with `autocomplete: true` and no `autocomplete.ts` next to it. Add one that exports a function for each of those options.

## Components

### missing-select-kind

A `select.ts` doesn't export `kind`, which says what the select menu picks from: `"string"`, `"user"`, `"role"`, `"channel"`, or `"mentionable"`.

```ts
export const kind = "user";
```

### invalid-select-kind

`kind` in a `select.ts` isn't `"string"`, `"user"`, `"role"`, `"channel"`, or `"mentionable"`.

### invalid-param-validator

The `params` passed to `defineComponent` names a parameter the route doesn't have, or a validator isn't a function or a Standard Schema. See [Validation](../concepts/custom-ids#validation).

### catch-all-route

Warning. A catch-all parameter takes any number of values, and they all count toward Discord's 100 character limit on custom IDs. `customId()` throws a `CustomIdTooLongError` when an ID goes over. That's fine if the values stay short. Otherwise, store a key in the custom ID instead of the data.

### short-id-collision

Two component routes hash to the same six-character short ID, so their custom IDs can't be told apart. Rename a directory in one of them.

### duplicate-component-pattern

Two component routes of the same kind have the same path except for parameter names, like `tickets/[id]/close` and `tickets/[ticketId]/close`. Parameter names don't make routes distinct. Merge them and keep one name.

## Events

### unknown-event

An `events/` directory isn't named after a discord.js event. The names are the values of discord.js's `Events` enum, like `messageCreate` and `guildMemberAdd`, and they're case-sensitive. The message suggests a name when it can, like `clientReady` for `ready`.

### event-nested-path

An `event.ts` has named directories between it and the event directory, like `events/messageCreate/logging/event.ts`. To split one event across files, use route groups, as in `events/messageCreate/(logging)/event.ts`.

### event-mode-conflict

Handlers of one event set different values for `meta.mode`. The mode applies to every handler of the event, so set it in one file, or make them match.

### missing-intent

Warning. `intents` in the config doesn't include an intent the event needs, so Discord never sends it. Add the intent to `intents` in `nectar.config.ts`. `GuildMembers`, `GuildPresences`, and `MessageContent` are privileged, and they also have to be turned on under Bot in the [Developer Portal](https://discord.com/developers/applications).

## Plugins

### plugin-failed

A plugin's `transform` threw. The message has the plugin's name and the error.

### plugin-invalid-change

A plugin's `transform` returned something other than an array of changes, a change with an unknown `type`, or middleware for an event route. Event routes don't run middleware.

### plugin-unknown-route

A plugin added middleware to a route ID that doesn't exist, or to a `kind` the route doesn't have. Route IDs look like `command:moderation/ban`. See [Route IDs](../concepts/app-directory#route-ids).

### plugin-missing-file

A plugin added middleware with a `file` that isn't an absolute path to an existing file.
