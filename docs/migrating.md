# Migrating from discord.js

This page starts from a bot laid out like the discord.js guide: command modules with `data` and `execute`, an `events/` folder, a loader in `index.js`, and a `deploy-commands.js` script. Nectar replaces the loader, the deploy script, and the dispatch in `interactionCreate`. Most handler code stays the same.

The examples are TypeScript. In JavaScript, use `.js` files and leave out the types.

## Switch to ES modules

Nectar only loads ES modules. Add `"type": "module"` to `package.json`, and change `require` and `module.exports` to `import` and `export`.

## Add the config

```bash
npm install @nectar-js/nectar
```

The intents from your `Client` constructor move into `nectar.config.ts`:

```ts
// nectar.config.ts
import { defineConfig } from "@nectar-js/nectar";

export default defineConfig({
  token: process.env.DISCORD_TOKEN,
  applicationId: process.env.DISCORD_APPLICATION_ID,
  intents: ["Guilds"],
  dev: { guilds: process.env.GUILD_ID ? [process.env.GUILD_ID] : [] },
});
```

Put the token and IDs from `config.json` in `.env` instead. Then delete `index.js`. Nectar creates the client, loads your handlers, and logs in.

## Commands

A command module becomes a `command.ts` in a directory named after the command:

```js
// before: commands/utility/ping.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong!"),
  async execute(interaction) {
    await interaction.reply("Pong!");
  },
};
```

```ts
// after: app/commands/ping/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = { description: "Replies with Pong!" };

export default defineCommand("ping", async (ctx) => {
  await ctx.interaction.reply("Pong!");
});
```

- `setName` goes away, since the directory is the name.
- The description and options move to `meta`. `.addUserOption((o) => o.setName("target").setDescription("Who").setRequired(true))` becomes `{ type: "user", name: "target", description: "Who", required: true }`. [Reserved files](./reference/files#command-ts) lists every field.
- `interaction` is `ctx.interaction`.
- Each `.addSubcommand()` becomes a subdirectory with its own `command.ts`, and the parent directory gets a `route.ts` with the description.
- Category folders like `utility/` can stay as route groups: `app/commands/(utility)/ping/command.ts` still registers `/ping`.

## Events

```js
// before: events/ready.js
const { Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
  },
};
```

```ts
// after: app/events/clientReady/event.ts
import { defineEvent } from "@nectar-js/nectar";

export const meta = { once: true };

export default defineEvent("clientReady", async (client) => {
  console.log(`Ready! Logged in as ${client.user.tag}`);
});
```

The directory is the event's name, the value of `Events.ClientReady`. If `events/interactionCreate.js` only runs commands, delete it.

## Buttons, select menus, and modals

If your `interactionCreate` handler also checks `customId` to route components, move each component into `app/components/` and build its ID with `customId`:

```js
// before
new ButtonBuilder().setCustomId(`close-${ticket.id}`);

if (interaction.isButton() && interaction.customId.startsWith("close-")) {
  const ticketId = interaction.customId.slice("close-".length);
  // ...
}
```

```ts
// after
new ButtonBuilder().setCustomId(customId("tickets/[ticketId]/close", { ticketId: ticket.id }));

// app/components/tickets/[ticketId]/close/button.ts
export default defineComponent("tickets/[ticketId]/close", async (ctx) => {
  const ticketId = ctx.params.ticketId;
  // ...
});
```

Messages sent before the switch still carry the old IDs, and Nectar ignores them. Keep handling the old format in `app/events/interactionCreate/event.ts` for as long as those messages matter.

## Registering commands

Delete `deploy-commands.js`. `nectar dev` registers your commands in `dev.guilds` while you work, and `nectar sync` registers them for production. See [Command registration](./concepts/registration).

## Scripts

```json
"scripts": {
  "dev": "nectar dev",
  "build": "nectar build",
  "start": "nectar start",
  "sync": "nectar sync"
}
```

## Other patterns

| In your bot | In Nectar |
| --- | --- |
| The `client.commands` collection | Not needed |
| Cooldowns and permission checks in `interactionCreate` | A `middleware.ts` |
| A `try`/`catch` around `execute` | An `error.ts` |
| Services attached to `client` | Plain imports, or a plugin's `ctx.services` |

## From another framework

Frameworks such as Sapphire map onto Nectar like this:

| Framework | Nectar |
| --- | --- |
| Command classes | `command.ts` |
| Listeners | `event.ts` |
| Interaction handlers that parse custom IDs | `button.ts`, `select.ts`, or `modal.ts` with parameters |
| Preconditions and guards | `middleware.ts` |
| Registering commands on startup | `nectar sync` |
