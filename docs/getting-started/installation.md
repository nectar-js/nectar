# Installation

## Requirements


- Node.js 22.18 or newer
- discord.js 14
- ESM, with `"type": "module"` in `package.json`

Node runs your TypeScript directly by stripping the types, so only erasable syntax works: no enums, namespaces with runtime code, or constructor parameter properties. Turn on `erasableSyntaxOnly` in `tsconfig.json` to catch them.

Local imports need the `.ts` extension, as in `import { db } from "./db.ts"`. TypeScript allows that with `allowImportingTsExtensions`, which new projects already set.

JavaScript projects are supported. Generated route types are TypeScript only.

## Create a project

```bash
npm create @nectar-js my-bot
cd my-bot
```

Choose TypeScript or JavaScript and your package manager. Accept the dependency installation, or install dependencies yourself before starting the bot. The examples below use npm.

The creator also asks for your bot token, application ID, and test server ID. You can enter them during setup or fill in `.env` afterward:

```dotenv
DISCORD_TOKEN=your-bot-token
DISCORD_APPLICATION_ID=your-application-id
DEV_GUILD_ID=your-test-server-id
```

Use your application's details from the [Discord Developer Portal](https://discord.com/developers/applications). Install the bot in the test server before trying a command. Keep `.env` out of version control.

See [@nectar-js/create](../packages/create) for language, package manager, and non-interactive options.

## Start the bot

```bash
npm run dev
```

Nectar registers the starter commands in your test server, connects to Discord, and watches your files. Run `/ping` in the server to check the bot responds.

Edit `app/commands/ping/command.ts`, or `command.js` in a JavaScript project, and run `/ping` again to see your change.

## Add a command

Create a directory under `app/commands/` with a `command.ts` or `command.js`. The directory determines the command name, and the first argument to `defineCommand` must match that path.

Continue with [Commands](../guides/commands) for options and subcommands, or [Project structure](../guides/project-structure) for the full directory layout.
