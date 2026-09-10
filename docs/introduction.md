# Introduction

Nectar is a framework for Discord bots, built on discord.js. Each command, button, select menu, modal, and event handler is a file under `app/`, and its path says what it handles:

```
app/
├── middleware.ts                           runs before every command and component
├── commands/
│   ├── ping/command.ts                     /ping
│   └── moderation/
│       ├── route.ts                        description of /moderation
│       ├── middleware.ts                   runs before every /moderation command
│       ├── ban/command.ts                  /moderation ban
│       └── kick/command.ts                 /moderation kick
├── components/
│   └── tickets/[ticketId]/close/button.ts  a button that carries a ticket ID
└── events/
    └── guildMemberAdd/event.ts             runs when a member joins
```

No file lists the commands, and no switch statement picks a handler for a custom ID. Adding a command means adding a directory.

```ts
// app/commands/ping/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = { description: "Check that the bot is alive" };

export default defineCommand("ping", async (ctx) => {
  await ctx.interaction.reply("Pong.");
});
```

`ctx.interaction` is the interaction discord.js created, and `ctx.client` is the discord.js client. Nectar doesn't wrap either, so the discord.js documentation applies as written.

Nectar reads `app/` before the bot starts. It checks every file against Discord's rules and writes what it found to `.nectar/manifest.json`. The running bot works from that manifest: it looks up the handler for each interaction there and imports the file. The concept pages go through each step.

## Create a project

```bash
npm create @nectar-js
```

It asks for a directory, TypeScript or JavaScript, and a package manager. The project it writes has one command, one button, one event, and a middleware. Then:

1. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID`. Both are in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Put your test server's ID in `dev.guilds` in `nectar.config.ts`.
3. Install the dependencies and run `npm run dev`.

`nectar dev` registers the commands in your test server, logs in, and reloads handlers when you save.

## Requirements

- Node.js 22.18 or newer.
- discord.js 14.
- ESM. Projects have `"type": "module"` in `package.json`.

Nectar has no TypeScript build step. Node strips the types when it imports a file, so your TypeScript can only use syntax Node knows how to erase: no `enum`, no `namespace` with runtime code, no constructor parameter properties. The `erasableSyntaxOnly` compiler option makes the editor flag them.

JavaScript projects work the same way. Only the generated route types are TypeScript-specific.
