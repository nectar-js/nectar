<p align="center">
  <img src="https://raw.githubusercontent.com/OMouta/Neat/main/assets/NectFavIcon.png" alt="Nect" width="96" />
</p>

<h1 align="center">Nect</h1>

<p align="center">A filesystem-based meta-framework for discord.js.</p>

<br />

A Discord bot already looks like an application with routes. Commands have names and subcommands. Buttons carry custom IDs. Autocomplete belongs to a command option. Middleware wants a scope.

Nect makes that structure literal. Your `app/` directory is the application model, and Nect compiles it into commands, components, events, middleware, and typed routes before the bot starts. You write handlers. discord.js stays fully accessible underneath.

```bash
npm create @nect-js
```

## How it maps

| File | What it becomes |
| --- | --- |
| `app/commands/ping/command.ts` | `/ping` |
| `app/commands/moderation/ban/command.ts` | `/moderation ban` |
| `app/commands/moderation/middleware.ts` | runs before every `/moderation` command |
| `app/commands/user/profile/autocomplete.ts` | autocomplete for that command's options |
| `app/components/tickets/[ticketId]/close/button.ts` | a button handler with a typed `ticketId` |
| `app/events/guildMemberAdd/event.ts` | a `guildMemberAdd` listener |

Directory names supply command names, event names, and custom ID routes. `[param]` segments become typed parameters, `(group)` directories organize without affecting the route.

```ts
// app/commands/user/profile/command.ts
export const meta: CommandMeta = {
  description: "Show a user's profile",
  options: [{ type: "user", name: "target", description: "Who to look up" }],
};

export default defineCommand("user/profile", async (ctx) => {
  const user = ctx.interaction.options.getUser("target") ?? ctx.interaction.user;
  await ctx.interaction.reply(`${user.tag}`);
});
```

Custom IDs come from the same routes that handle them, typed against the generated route map. A misspelled parameter is a compile error.

```ts
new ButtonBuilder().setCustomId(customId("tickets/[ticketId]/close", { ticketId: ticket.id }));
```

## What Nect handles

- Command registration. Nect diffs the compiled commands against what Discord has and writes only when something changed. Running it twice makes zero writes the second time.
- Custom IDs. Routes generate them and routes parse them. The encoder refuses to exceed Discord's length limit instead of truncating, and IDs it did not produce are left alone.
- Interaction routing. Commands, subcommands, context menus, buttons, selects, modals, and autocomplete resolve through one compiled route graph.
- Middleware and error boundaries, resolved at build time from file placement and run outer to inner.
- Development server. `nect dev` hot-swaps handlers without reconnecting to the gateway and re-registers dev guild commands when metadata changes.
- Generated types for route names, parameters, command options, and middleware context.
- Diagnostics. Conflicting routes, invalid nesting, and Discord limit violations fail the build with the file that caused them.

Production loads a compiled manifest. It never scans source files.

## What stays yours

discord.js. Every handler receives the native interaction and client. Builders, collections, permissions, REST, caching, and sharding work unchanged. Nect adds structure on top and does not rename or wrap Discord concepts.

Your database, your state, your business logic. Nect ships no ORM, no dashboard, no ticket system.

## CLI

```
nect dev        compile, register dev guild commands, run the bot, reload on changes
nect build      compile the app and write the manifest and types
nect check      compile and report problems without writing anything
nect start      run the bot from the last build
nect routes     show the app tree with middleware scopes and error boundaries
nect manifest   print the compiled manifest, or everything about one route
nect sync       register commands with Discord, writing only scopes that changed
nect clean      delete the build output directory
nect info       show versions, environment, and the effective config
```

## Requirements

Node.js 22.18 or newer, ESM, discord.js v14. TypeScript is the primary experience. JavaScript projects get the same routing, runtime, and CLI, with validation at startup instead of at compile time.

## Contributing

See [CONTRIBUTING.md](https://github.com/OMouta/Neat/blob/main/CONTRIBUTING.md).

## License

MIT. See [LICENSE](https://github.com/OMouta/Neat/blob/main/LICENSE).
