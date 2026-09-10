# Compilation

Nectar reads `app/` before the bot runs. The compiler turns the tree into a manifest, a JSON file that describes every route, and the running bot works from that file.

Every CLI command that needs your routes compiles first: `nectar build`, `nectar check`, `nectar dev`, `nectar routes`, `nectar manifest`, and `nectar sync`.

## What the compiler does

1. Walks `app/` and collects the reserved files.
2. Parses each directory name and builds every route's path and ID.
3. Imports each `command.ts`, `autocomplete.ts`, `route.ts`, `button.ts`, `select.ts`, `modal.ts`, and `event.ts` to read its exports: the handler with its route string, `meta`, a select menu's `kind`, and parameter validators.
4. Checks the result against Discord's rules and for conflicts between routes.
5. Works out each route's middleware and error boundaries.
6. Builds each command's registration payload, the JSON that Discord's API takes.
7. Runs plugin transforms.
8. Writes `.nectar/manifest.json` and `.nectar/types.d.ts`.

`nectar check` does all of this except the last step.

Step 3 runs your code. Top-level code in a handler file, and in everything it imports, runs every time Nectar compiles. If a handler module opens a database connection when it's imported, `nectar build` opens one too. Do that work inside the handler, or in a module that connects on first use.

Middleware and error files aren't imported until the bot runs.

## What it checks

The compiler catches what Discord would reject when you register the commands, and what would fail when the bot runs:

- Slash command, subcommand, and option names are lowercase and 1 to 32 characters. Descriptions are 1 to 100.
- A command has at most 25 options, 25 subcommands and groups, and 25 choices per option. Required options come before optional ones.
- Commands nest at most three levels, a command with subcommands has no `command.ts` of its own, and every parent and group has a `route.ts`.
- No two commands register under the same name, and no two component routes have the same shape. `tickets/[id]/close` and `tickets/[ticketId]/close` would claim the same custom IDs.
- Each export of an `autocomplete.ts` matches an option with `autocomplete: true`, and each such option has an export.
- Every `events/` directory names a discord.js event, and every `select.ts` exports a valid `kind`.
- Every handler's route string matches its file.

It also warns when an event can't fire with the intents in your config. It never adds the intent for you.

## Diagnostics

Each problem is reported with a code, the file, and what to change:

```
✖ error  route-mismatch  app/commands/ban/command.ts
  This file is the route "ban" but its handler declares "moderation/ban". Update the string or move the file.
▲ warning  missing-intent  app/events/guildMemberAdd/event.ts
  "guildMemberAdd" never fires without the "GuildMembers" intent. Add it to `intents` in nectar.config.ts. "GuildMembers" is privileged: enable it under Bot in the Discord developer portal as well.
✖ 1 error. Fix the files above and run again.
```

An error stops the command. `nectar build` writes nothing and exits with code 1. Warnings are printed and the command carries on. Under `nectar dev`, an error keeps the previous routes running until you fix the file.

## The manifest

`.nectar/manifest.json` holds, for every route:

- its ID, kind, path, and handler file
- its middleware files, in the order they run
- its error boundaries, nearest first
- for commands, the registration payload and which subcommand each handler answers
- for components, the short ID and parameter names that make up the custom ID
- for events, the order and mode the handlers run in

File paths in the manifest are relative, so a manifest built on one machine works on another.

The runtime never scans `app/` to find routes. When an interaction arrives, the runtime looks up its route in tables built from the manifest and imports the handler file listed there.

`.nectar/` holds metadata, not compiled code. Nectar doesn't bundle or transpile your handlers. Node imports them from `app/`, so a deployment needs `app/` next to `.nectar/`.

## Generated types

`.nectar/types.d.ts` adds your routes to the types of `@nectar-js/nectar`. With it, TypeScript knows:

- the paths `defineCommand`, `defineComponent`, and `customId` accept
- the parameters of each component route
- the options of each command, for the testing helpers
- what each route's middleware adds to `ctx`

So a misspelled parameter fails type checking instead of throwing when the bot runs:

```ts
customId("tickets/[ticketId]/close", { ticket: "42" }); // type error: the parameter is ticketId
```

Include `.nectar/types.d.ts` in `tsconfig.json`, as new projects do. `nectar build` and `nectar dev` rewrite it. Before the first build, every path is accepted and parameters are untyped.

## Seeing the result

`nectar routes` prints the app tree with what each file became. For the [example app](https://github.com/nectar-js/nectar/tree/main/examples/basic) in the Nectar repository:

```
app
├── error.ts               error boundary for 12 routes
├── middleware.ts          middleware for 12 routes
├── commands
│   ├── moderation
│   │   ├── middleware.ts  middleware for 2 routes
│   │   ├── route.ts       command metadata
│   │   ├── ban            /moderation ban
│   │   └── kick           /moderation kick
│   ├── ping               /ping
│   └── user
│       ├── route.ts       command metadata
│       └── profile        /user profile · autocomplete: section
├── components
│   ├── pagination
│   │   └── [page]
│   │       ├── next       button n:1w74m6:<page>
│   │       └── prev       button n:1n652h:<page>
│   └── tickets
│       └── [ticketId]
│           ├── assign     select (user) n:1x540s:<ticketId>
│           └── close      button n:31imou:<ticketId>
└── events
    ├── clientReady        event clientReady
    └── guildMemberAdd
        ├── (audit)        event guildMemberAdd (sequential)
        └── (welcome)      event guildMemberAdd (sequential)
```

`nectar manifest --route command:moderation/ban` prints that route's manifest entry, with the payload Discord will receive. `nectar manifest` on its own prints the whole manifest.
