<p align="center">
  <img src="https://raw.githubusercontent.com/nectar-js/nectar/main/assets/NectarFullSmall.png" alt="Nectar" width="192" />
</p>

<h1 align="center">Nectar</h1>

<p align="center">A filesystem-based meta-framework for discord.js.</p>

<br />

Nectar is a framework for Discord bots. You define commands, components, and events as files under `app/`, and Nectar handles command registration, custom ID encoding, and interaction routing.

`app/commands/ping/command.ts` registers `/ping`, and `app/commands/moderation/ban/command.ts` registers `/moderation ban`. `app/components/tickets/[ticketId]/close/button.ts` handles a button whose custom ID carries a typed `ticketId`. Handlers get the discord.js interaction and client.

```bash
npm create @nectar-js
```

```ts
// app/commands/ping/command.ts  ->  /ping
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = { description: "Check if the bot is alive" };

export default defineCommand("ping", async (ctx) => {
  await ctx.interaction.reply("Pong.");
});
```

```bash
nectar dev      # run the bot, reloading handlers on save
nectar build    # compile to .nectar/
nectar sync     # register commands with Discord
nectar start    # run the compiled build
```

`nectar --help` lists the rest. The documentation is at [nectar-js.github.io/nectar](https://nectar-js.github.io/nectar/).

## Requirements

Node.js 22.18 or newer, ESM, discord.js v14. JavaScript projects are supported; the generated route types are TypeScript-only.

## Contributing

See [CONTRIBUTING.md](https://github.com/nectar-js/nectar/blob/main/CONTRIBUTING.md).

## License

MIT. See [LICENSE](https://github.com/nectar-js/nectar/blob/main/LICENSE).
