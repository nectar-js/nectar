<p align="center">
  <img src="https://raw.githubusercontent.com/OMouta/Neat/main/assets/NectFavIcon.png" alt="Nect" width="96" />
</p>

<h1 align="center">Nect</h1>

<p align="center">A filesystem-based meta-framework for discord.js.</p>

<br />

Nect turns your Discord application's directory tree into commands, components, events, middleware, and typed routes. You write handlers. Nect owns the client bootstrap, command registration, custom ID encoding and parsing, interaction routing, file watching, and the production build. discord.js stays fully accessible underneath.

```bash
npm create @nect-js
```

Or add it to a project you already have:

```bash
npm install @nect-js/core discord.js
```

## The idea

A Discord bot already looks like an application with routes. Commands have names and subcommands. Buttons and selects carry custom IDs. Modals return identifiers. Autocomplete belongs to a command option. Middleware wants a scope.

Nect makes that structure literal. The filesystem is the application model.

```bash
app/
  middleware.ts                  # applies to everything
  error.ts                       # global error boundary
  commands/
    ping/command.ts              # /ping
    moderation/
      route.ts                   # description and permissions for the parent
      middleware.ts              # applies to /moderation *
      ban/command.ts             # /moderation ban
      kick/command.ts            # /moderation kick
    user/
      profile/
        command.ts               # /user profile
        autocomplete.ts          # autocomplete for its options
  components/
    tickets/
      [ticketId]/
        close/button.ts          # button, ticketId decoded from the custom ID
        assign/select.ts         # user select menu
    pagination/
      [page]/
        next/button.ts
        prev/button.ts
  events/
    clientReady/event.ts
    guildMemberAdd/
      (welcome)/event.ts         # two handlers for one event
      (audit)/event.ts
```

Nect compiles this tree into a manifest before the bot starts. Production loads the manifest. It never scans source files.

## What it looks like

A command. The name comes from the directory. Everything Discord requires and cannot derive lives in `meta`.

```ts
// app/commands/user/profile/command.ts
import { type CommandMeta, defineCommand } from "@nect-js/core";

export const meta: CommandMeta = {
  description: "Show a user's profile",
  options: [{ type: "user", name: "target", description: "Who to look up" }],
};

export default defineCommand("user/profile", async (ctx) => {
  const user = ctx.interaction.options.getUser("target") ?? ctx.interaction.user;
  await ctx.interaction.reply(`${user.tag} joined <t:${Math.floor(user.createdTimestamp / 1000)}:R>`);
});
```

The route path passed to `defineCommand` is checked against the file's location, so a moved file that forgot to update its route fails the build.

A button with a dynamic segment. The parameter is typed because of where the file lives.

```ts
// app/components/tickets/[ticketId]/close/button.ts
import { defineComponent } from "@nect-js/core";

export default defineComponent("tickets/[ticketId]/close", async (ctx) => {
  // ctx.params.ticketId is a string, inferred from the route
  await closeTicket(ctx.params.ticketId);
  await ctx.interaction.update({ content: `Ticket ${ctx.params.ticketId} closed.`, components: [] });
});
```

Building that button somewhere else. `customId` is typed against the generated route map, so a missing or misspelled parameter is a compile error.

```ts
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { customId } from "@nect-js/core";

const close = new ButtonBuilder()
  .setCustomId(customId("tickets/[ticketId]/close", { ticketId: ticket.id }))
  .setLabel("Close")
  .setStyle(ButtonStyle.Danger);

await interaction.reply({ components: [new ActionRowBuilder<ButtonBuilder>().addComponents(close)] });
```

Middleware, scoped by placement. This file sits in `app/commands/moderation/`, so it runs for every moderation command and nothing else. What it passes to `next` becomes part of the context type downstream.

```ts
// app/commands/moderation/middleware.ts
import { defineMiddleware } from "@nect-js/core";
import { MessageFlags, PermissionFlagsBits } from "discord.js";

export default defineMiddleware(async (ctx, next) => {
  const member = ctx.interaction.inCachedGuild() ? ctx.interaction.member : null;
  if (!member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await ctx.interaction.reply({ content: "You can't do that.", flags: MessageFlags.Ephemeral });
    return; // stops here
  }
  return next({ member });
});
```

An event. The directory name is the discord.js event name. Handlers get the native arguments.

```ts
// app/events/guildMemberAdd/(welcome)/event.ts
import { defineEvent } from "@nect-js/core";

export default defineEvent("guildMemberAdd", async (member) => {
  await member.guild.systemChannel?.send(`Welcome, ${member}.`);
});
```

Configuration covers only what the tree cannot express.

```ts
// nect.config.ts
import { defineConfig } from "@nect-js/core";

export default defineConfig({
  token: process.env.DISCORD_TOKEN,
  applicationId: process.env.DISCORD_APPLICATION_ID,
  intents: ["Guilds", "GuildMembers"],
  dev: {
    guilds: ["123456789012345678"],
  },
});
```

## What Nect handles for you

- Command registration. Nect diffs the compiled commands against what Discord has and only writes when something changed. Development registers to your dev guilds, production registers globally. Running it twice makes zero writes the second time.
- Custom IDs. Routes generate them and routes parse them. There is one source of truth, and the encoder refuses to exceed Discord's length limit instead of truncating. IDs that were not produced by Nect are left alone, so hand-rolled components keep working.
- Interaction routing. Commands, subcommands, context menus, buttons, selects, modals, and autocomplete all resolve through the same compiled route graph.
- Middleware and error boundaries, resolved at build time from file placement and run outer to inner. A boundary can rethrow to bubble to the next one up.
- Development server. `nect dev` watches your files, hot-swaps handlers without reconnecting to the gateway, rebuilds routes when the tree changes, and updates dev guild commands when metadata changes.
- Generated types. Route names, parameters, command options, and middleware context are emitted as a `.d.ts` you never edit.
- Diagnostics. Conflicting routes, invalid nesting, and Discord limit violations fail the build with the file that caused them.

## What stays yours

discord.js. Every handler receives the native interaction and client. Builders, collections, permissions, REST, caching, sharding, and the rest of the discord.js API work unchanged. Nect adds structure on top and does not rename or wrap Discord concepts.

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
