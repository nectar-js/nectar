# Introduction

Nectar is a framework for Discord bots built on discord.js. Commands, components, and events are files in `app/`. Nectar registers the commands and routes each interaction to its file.

```ts
// app/commands/ping/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = { description: "Check that the bot is alive" };

export default defineCommand("ping", async (ctx) => {
  await ctx.interaction.reply("Pong.");
});
```

This registers `/ping`. `ctx.interaction` is the discord.js `ChatInputCommandInteraction`.

## Create a project

```bash
npm create @nectar-js
```

Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID` from the [Developer Portal](https://discord.com/developers/applications). Add your test server's ID to `dev.guilds` in `nectar.config.ts`, then run `npm run dev`.

## Requirements

- Node.js 22.18 or newer
- discord.js 14
- ESM, with `"type": "module"` in `package.json`

Node runs your TypeScript directly by stripping the types, so only erasable syntax works: no enums, namespaces with runtime code, or constructor parameter properties. Turn on `erasableSyntaxOnly` in `tsconfig.json` to catch them.

Local imports need the `.ts` extension, as in `import { db } from "./db.ts"`. TypeScript allows that with `allowImportingTsExtensions`, which new projects already set.

JavaScript projects are supported. Generated route types are TypeScript only.
