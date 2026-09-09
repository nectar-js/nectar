<p align="center">
  <img src="./assets/NectFavIcon.png" alt="Nect" width="96" />
</p>

<h1 align="center">Nect</h1>

<p align="center">A filesystem-based meta-framework for discord.js.</p>

<p align="center"><strong>Status:</strong> In Development</p>

<br />

Nect turns your Discord application's directory tree into commands, components, events, middleware, and typed routes. discord.js stays fully accessible underneath. You write handlers. Nect owns the client bootstrap, command registration, custom ID parsing, interaction routing, file watching, and production build.

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
    ready/event.ts
    guildMemberAdd/
      (welcome)/event.ts         # two handlers for one event
      (audit)/event.ts
```

Nect compiles this tree into a manifest before the bot starts. Production loads the manifest. It never scans source files.

## What it looks like

A command. The name comes from the directory. Everything Discord requires and cannot derive lives in `meta`.

```ts
// app/commands/user/profile/command.ts
import { defineCommand } from "@nect-js/core";

export const meta = {
  description: "Show a user's profile",
  options: [
    { type: "user", name: "target", description: "Who to look up" },
  ],
};

export default defineCommand(async ({ interaction }) => {
  const user = interaction.options.getUser("target") ?? interaction.user;
  await interaction.reply({ content: `${user.tag} joined <t:${Math.floor(user.createdTimestamp / 1000)}:R>` });
});
```

A button with a dynamic segment. The parameter is typed because of where the file lives.

```ts
// app/components/tickets/[ticketId]/close/button.ts
import { defineComponent } from "@nect-js/core";

export default defineComponent(async ({ interaction, params }) => {
  // params.ticketId is a string, inferred from the route
  await closeTicket(params.ticketId);
  await interaction.update({ content: `Ticket ${params.ticketId} closed.`, components: [] });
});
```

Building that button somewhere else. `customId` is typed against the generated route map, so a missing or misspelled parameter is a compile error.

```ts
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
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
import { PermissionFlagsBits } from "discord.js";

export default defineMiddleware(async (ctx, next) => {
  const member = ctx.interaction.inCachedGuild() ? ctx.interaction.member : null;
  if (!member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await ctx.interaction.reply({ content: "You can't do that.", ephemeral: true });
    return; // stops here
  }
  return next({ member });
});
```

An event. The directory name is the discord.js event name. Handlers get the native arguments.

```ts
// app/events/guildMemberAdd/(welcome)/event.ts
import { defineEvent } from "@nect-js/core";

export default defineEvent(async (member) => {
  await member.guild.systemChannel?.send(`Welcome, ${member}.`);
});
```

Configuration covers only what the tree cannot express.

```ts
// nect.config.ts
import { defineConfig } from "@nect-js/core";
import { GatewayIntentBits } from "discord.js";

export default defineConfig({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  dev: {
    guilds: ["123456789012345678"],
  },
});
```

## What Nect handles for you

- Command registration. Nect diffs the compiled commands against what Discord has and only writes when something changed. Development registers to your dev guilds, production registers globally.
- Custom IDs. Routes generate them and routes parse them. There is one source of truth, and the encoder refuses to exceed Discord's length limit instead of truncating.
- Interaction routing. Commands, subcommands, context menus, buttons, selects, modals, and autocomplete all resolve through the same compiled route graph.
- Middleware and error boundaries, resolved at build time from file placement and run outer to inner.
- Development server. `nect dev` watches your files, hot-swaps handlers without reconnecting to the gateway, rebuilds routes when the tree changes, and updates dev guild commands when metadata changes.
- Generated types. Route names, parameters, command options, and middleware context are emitted as a `.d.ts` you never edit.
- Diagnostics. Conflicting routes, invalid nesting, and Discord limit violations fail the build with the file that caused them.

## What stays yours

discord.js. Every handler receives the native interaction and client. Builders, collections, permissions, REST, caching, sharding, and the rest of the discord.js API work unchanged. Nect adds structure on top and does not rename or wrap Discord concepts.

Your database, your state, your business logic. Nect ships no ORM, no dashboard, no ticket system.

## CLI

```
nect dev        start the development server
nect build      compile to a manifest and production output
nect start      run the production build
nect check      validate the app without writing output
nect routes     print the compiled route tree
nect manifest   inspect the manifest, per route with --route
nect sync       reconcile command registration with Discord
nect clean      delete generated output
nect info       versions and environment
```

New projects start with `npm create @nect-js`.

## Requirements

Node.js LTS, ESM, discord.js v14. TypeScript is the primary experience. JavaScript projects get the same routing, runtime, and CLI with validation at startup instead of at compile time.

## License

MIT. Check [LICENSE](./LICENSE) for details.
