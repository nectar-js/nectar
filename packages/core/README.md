<p align="center">
  <img src="https://raw.githubusercontent.com/OMouta/Neat/main/assets/NectFavIcon.png" alt="Nect" width="96" />
</p>

<h1 align="center">Nect</h1>

<p align="center">A filesystem-based meta-framework for discord.js.</p>

<br />

Put handler files in `app/`. Nect compiles the directory tree into slash commands, component handlers, and event listeners, registers the commands with Discord, and routes interactions to the right handler. Handlers get the native discord.js interaction and client.

```bash
npm create @nect-js
```

```ts
// app/commands/ping/command.ts  ->  /ping
import { type CommandMeta, defineCommand } from "@nect-js/core";

export const meta: CommandMeta = { description: "Check if the bot is alive" };

export default defineCommand("ping", async (ctx) => {
  await ctx.interaction.reply("Pong.");
});
```

```bash
nect dev      # run the bot, reloading on changes
nect build    # compile to .nect/
nect start    # run the compiled build
```

`nect --help` lists the rest.

## Requirements

Node.js 22.18 or newer, ESM, discord.js v14. JavaScript projects are supported; the generated route types are TypeScript-only.

## Contributing

See [CONTRIBUTING.md](https://github.com/OMouta/Neat/blob/main/CONTRIBUTING.md).

## License

MIT. See [LICENSE](https://github.com/OMouta/Neat/blob/main/LICENSE).
