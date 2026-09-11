# Migrating from Sapphire

Sapphire loads classes from folders like `src/commands` and `src/listeners`, and each class sets its own name and options. In Nectar, a file's path decides what it handles, and the file exports a function. The discord.js code inside your handlers stays the same.

| Sapphire | Nectar |
| --- | --- |
| A `Command` class in `src/commands/` | `app/commands/<name>/command.ts` |
| `registerApplicationCommands` | `export const meta` |
| `chatInputRun` and `contextMenuRun` | The default export |
| `@sapphire/plugin-subcommands` | One directory per subcommand |
| A `Listener` class in `src/listeners/` | `app/events/<event>/event.ts` |
| An `InteractionHandler` with `parse` | `button.ts`, `select.ts`, or `modal.ts` with route parameters |
| `autocompleteRun` | `autocomplete.ts` |
| Preconditions | `middleware.ts` |
| `container` | Imports, or a plugin service |
| Registration on login | `nectar dev` and `nectar sync` |

## The client

`SapphireClient` goes away, and its intents move into `nectar.config.ts`:

```ts
// before: src/index.ts
const client = new SapphireClient({ intents: [GatewayIntentBits.Guilds] });
client.login(process.env.DISCORD_TOKEN);
```

```ts
// after: nectar.config.ts
import { defineConfig } from "@nectar-js/nectar";

export default defineConfig({
  token: process.env.DISCORD_TOKEN,
  applicationId: process.env.DISCORD_APPLICATION_ID,
  intents: ["Guilds"],
});
```

Other client options go in `client`. Nectar only loads ES modules, so add `"type": "module"` to `package.json` if the project doesn't have it.

## Commands

```ts
// before: src/commands/ping.ts
import { Command } from "@sapphire/framework";

export class PingCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName("ping").setDescription("Ping bot to see if it is alive"),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    return interaction.reply("Pong!");
  }
}
```

```ts
// after: app/commands/ping/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = { description: "Ping bot to see if it is alive" };

export default defineCommand("ping", async (ctx) => {
  await ctx.interaction.reply("Pong!");
});
```

The builder calls in `registerApplicationCommands` become `meta`: `setDescription` is `description`, and each `add...Option` is an entry in `options`. `this.container.client` is `ctx.client`.

A context menu command registered with `registerContextMenuCommand` becomes a top-level `command.ts` with `meta.type` set to `"user"` or `"message"`, and its `contextMenuRun` becomes the default export.

## Subcommands

A `Subcommand` class lists its subcommands and maps each one to a method. In Nectar, each subcommand is a directory with its own `command.ts`, and the parent directory gets a `route.ts` with the description. A `/vip` command with `list` and `add` becomes `app/commands/vip/list/command.ts`, `app/commands/vip/add/command.ts`, and `app/commands/vip/route.ts`.

## Listeners

```ts
// before: src/listeners/ready.ts
import { Listener } from "@sapphire/framework";
import type { Client } from "discord.js";

export class ReadyListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, { ...options, once: true, event: "ready" });
  }

  public run(client: Client) {
    this.container.logger.info(`Logged in as ${client.user!.username}`);
  }
}
```

```ts
// after: app/events/clientReady/event.ts
import { defineEvent } from "@nectar-js/nectar";

export const meta = { once: true };

export default defineEvent("clientReady", async (client) => {
  console.log(`Logged in as ${client.user.username}`);
});
```

The `event` option becomes the directory name. Current discord.js calls the ready event `clientReady`. For several listeners on one event, put each in a route group, like `app/events/guildMemberAdd/(welcome)/event.ts`.

## Interaction handlers

Each Sapphire button handler sees every button and uses `parse` to pick out its own custom IDs. In Nectar, a custom ID names its route, so there's nothing to parse:

```ts
// before: src/interaction-handlers/close-ticket.ts
import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";

export class CloseTicketHandler extends InteractionHandler {
  public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("close:")) return this.none();
    return this.some({ ticketId: interaction.customId.slice("close:".length) });
  }

  public async run(interaction: ButtonInteraction, { ticketId }: InteractionHandler.ParseResult<this>) {
    await interaction.update({ content: `Ticket ${ticketId} closed.`, components: [] });
  }
}
```

```ts
// after: app/components/tickets/[ticketId]/close/button.ts
import { defineComponent } from "@nectar-js/nectar";

export default defineComponent("tickets/[ticketId]/close", async (ctx) => {
  await ctx.interaction.update({ content: `Ticket ${ctx.params.ticketId} closed.`, components: [] });
});
```

Build the ID with `customId("tickets/[ticketId]/close", { ticketId })` instead of by hand. Checks that `parse` ran on the values belong in [parameter validators](../concepts/custom-ids#validation).

Messages sent before the switch still carry the old IDs, and Nectar ignores them. Keep handling the old format in `app/events/interactionCreate/event.ts` for as long as those messages matter.

## Autocomplete

An `autocompleteRun` method, or an autocomplete interaction handler, becomes an `autocomplete.ts` next to the command's `command.ts`, with one export per option. See [Reserved files](../reference/files#autocomplete-ts).

## Preconditions

A precondition runs for the commands that list it. A middleware runs for every command in its directory, so group the commands that share a check. A route group keeps their names the same:

```ts
// before: src/preconditions/OwnerOnly.ts, with preconditions: ["OwnerOnly"] on each command
export class OwnerOnlyPrecondition extends Precondition {
  public override async chatInputRun(interaction: CommandInteraction) {
    return owners.includes(interaction.user.id)
      ? this.ok()
      : this.error({ message: "Only the bot owner can use this command!" });
  }
}
```

```ts
// after: app/commands/(owner)/middleware.ts
import { defineMiddleware } from "@nectar-js/nectar";
import { MessageFlags } from "discord.js";

export default defineMiddleware(async (ctx, next) => {
  if (owners.includes(ctx.interaction.user.id)) return next();
  if (ctx.interaction.isRepliable()) {
    await ctx.interaction.reply({
      content: "Only the bot owner can use this command!",
      flags: MessageFlags.Ephemeral,
    });
  }
});
```

Sapphire says nothing when a precondition fails unless you add a `chatInputCommandDenied` listener. The middleware replies itself, so that listener goes away.

Sapphire's built-in command options map to helpers:

| Sapphire | Nectar |
| --- | --- |
| `requiredUserPermissions` | `requirePermissions()` |
| `runIn: CommandOptionsRunTypeEnum.GuildAny` | `guildOnly()` |
| `requiredClientPermissions` | A middleware that checks `ctx.interaction.appPermissions` |
| `cooldownDelay` | A middleware of your own |

## The container

Anything you put on `container` becomes an ordinary module that handlers import. The compiler imports your handler files when it builds, so connect to databases and other services on first use, not at import time. For something that has to start and stop with the bot, a plugin's `start` hook can return it as a service on `ctx.services`. See [Plugins](../reference/plugins).

## Registration

Sapphire registers application commands when the client logs in, using each command's `guildIds` and `idHints`. Nectar never registers on startup. `nectar dev` registers to `dev.guilds`, and `nectar sync` registers for production, globally or to `commands.target`. Nectar matches commands by name, so `idHints` have no equivalent. See [Command registration](../concepts/registration).

## Message commands

Nectar only routes application commands. Move prefix commands from `messageRun` to slash commands, or handle them in `app/events/messageCreate/event.ts`, which needs the `MessageContent` intent.
