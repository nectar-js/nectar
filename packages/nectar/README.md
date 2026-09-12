<p align="center">
  <img src="https://raw.githubusercontent.com/nectar-js/nectar/main/assets/NectarFullSmall.png" alt="Nectar" width="192" />
</p>

<h1 align="center">Nectar</h1>

<p align="center">A filesystem-based meta-framework for discord.js.</p>

<div align="center">
  <a href="https://www.npmjs.com/package/@nectar-js/nectar">
    <img alt="NPM Version" src="https://img.shields.io/npm/v/%40nectar-js%2Fnectar?style=for-the-badge&color=f27506">
  </a>
  <img alt="NPM License" src="https://img.shields.io/npm/l/%40nectar-js%2Fnectar?style=for-the-badge&color=f27506">
  <a href="https://github.com/nectar-js/nectar/stargazers">
    <img alt="GitHub Stars" src="https://img.shields.io/github/stars/nectar-js/nectar?style=for-the-badge&color=f27506">
  </a>
</div>

<p align="center">
  <a href="https://nectar-js.github.io/nectar/">Documentation</a> ·
  <a href="https://nectar-js.github.io/nectar/introduction">Getting started</a> ·
  <a href="https://github.com/nectar-js/nectar/tree/main/examples">Examples</a> ·
  <a href="https://github.com/nectar-js/nectar/blob/main/packages/nectar/CHANGELOG.md">Changelog</a>
</p>

<br />

> [!WARNING]
> Nectar is pre-1.0 software. Breaking changes can land in any 0.x minor release. Read the [changelog](https://github.com/nectar-js/nectar/blob/main/packages/nectar/CHANGELOG.md) before upgrading, and [Compatibility](https://nectar-js.github.io/nectar/reference/compatibility) for what counts as a breaking change.

## What is Nectar?

Nectar is a framework for Discord bots built on discord.js. Commands, components, and events are files in `app/`. The file's path is the route. Nectar compiles that tree, registers the commands with Discord, and sends each interaction to its file.

```
app/
├── commands/
│   ├── ping/command.ts                  →  /ping
│   └── moderation/
│       ├── route.ts                     →  description for /moderation
│       ├── middleware.ts                →  runs before every /moderation subcommand
│       └── ban/command.ts               →  /moderation ban
├── components/
│   └── tickets/[ticketId]/close/button.ts  →  a button whose custom ID carries ticketId
└── events/
    └── guildMemberAdd/event.ts          →  discord.js guildMemberAdd
```

Handlers receive the discord.js interaction, so nothing about discord.js is hidden from you.

```ts
// app/commands/ping/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = { description: "Check that the bot is alive" };

export default defineCommand("ping", async (interaction) => {
  await interaction.reply("Pong.");
});
```

## Getting started

```bash
npm create @nectar-js
```

The prompt asks for a folder, a language, and a package manager, then for your bot token, application ID, and test server ID. Then:

```bash
cd my-bot
npm run dev
```

Save a file and the bot reloads. Commands register to your test server while you work. The [introduction](https://nectar-js.github.io/nectar/introduction) walks through the first project.

## Features

**File-based routing.** Nesting directories under `commands/` produces subcommands and subcommand groups. `[param]` directories under `components/` become custom ID parameters, and `(group)` directories scope middleware without changing the route.

**Typed command options.** Declare options in `meta` and the handler receives them as a typed object.

```ts
// app/commands/moderation/ban/command.ts
export const meta: CommandMeta = {
  description: "Ban a member",
  options: [{ type: "user", name: "target", description: "Who to ban", required: true }],
};

export default defineCommand("moderation/ban", async (interaction, { target }) => {
  await interaction.guild?.members.ban(target);
  await interaction.reply(`Banned ${target.username}.`);
});
```

**Custom IDs you never write by hand.** `customId("tickets/[ticketId]/close", { ticketId })` encodes the route and its parameters. The handler decodes them, runs your validators, and passes `params.ticketId` as a string. With generated types, a typo in the route or a missing parameter is a compile error.

```ts
// app/components/tickets/[ticketId]/close/button.ts
export default defineComponent("tickets/[ticketId]/close", async (interaction, params) => {
  await closeTicket(params.ticketId);
  await interaction.update({ content: "Ticket closed.", components: [] });
});
```

**Middleware and error boundaries.** A `middleware.ts` runs before every route in its directory and can pass data down or stop the request. An `error.ts` catches what the routes below it throw.

```ts
// app/commands/moderation/middleware.ts
import { requirePermissions } from "@nectar-js/nectar";

export default requirePermissions("BanMembers");
```

**Safe command registration.** `nectar sync --dry-run` shows what would change before you apply it. The sync refuses to write when the application ID changed, a previous target disappeared from the config, or it would wipe every command from a server, unless you pass `--force`.

**Compile-time checks.** `nectar build` fails on a route string that doesn't match its file, a reserved file in the wrong directory, or an event directory that isn't a discord.js event. Each diagnostic links to a page explaining the fix.

**Testing without Discord.** `@nectar-js/nectar/testing` runs your routes through the real dispatch code against stubbed interactions.

```ts
const app = createTestApp(new URL("../.nectar/manifest.json", import.meta.url));

test("ping replies", async () => {
  const { responses } = await app.command("ping");
  expect(responses).toEqual([{ method: "reply", options: "Pong." }]);
});
```

Also covered in the docs: [scheduled jobs](https://nectar-js.github.io/nectar/guides/jobs), [localization](https://nectar-js.github.io/nectar/guides/localization), [sharding](https://nectar-js.github.io/nectar/guides/sharding), [plugins](https://nectar-js.github.io/nectar/reference/plugins), and [deploying](https://nectar-js.github.io/nectar/guides/deployment).

## CLI

| Command | |
| --- | --- |
| `nectar dev` | Run the bot and reload on save |
| `nectar build` | Compile `app/` to `.nectar/` |
| `nectar check` | Compile and report problems without writing |
| `nectar routes` | Print the route tree |
| `nectar sync` | Register commands with Discord |
| `nectar start` | Run the last build |

`nectar --help` lists the rest. See the [CLI reference](https://nectar-js.github.io/nectar/reference/cli).

## Requirements

- Node.js 22.18 or newer
- discord.js 14
- ESM, with `"type": "module"` in `package.json`

JavaScript projects work too. Generated route types are TypeScript only.

## Documentation

Everything is at [nectar-js.github.io/nectar](https://nectar-js.github.io/nectar/). Good starting points:

- [Introduction](https://nectar-js.github.io/nectar/introduction)
- [Project structure](https://nectar-js.github.io/nectar/guides/project-structure)
- [Custom IDs](https://nectar-js.github.io/nectar/guides/custom-ids)
- [Middleware](https://nectar-js.github.io/nectar/guides/middleware)
- [Error handling](https://nectar-js.github.io/nectar/guides/errors)
- [Migrating from discord.js](https://nectar-js.github.io/nectar/migrating/discord-js)
- [Migrating from Sapphire](https://nectar-js.github.io/nectar/migrating/sapphire)

## Contributing

See [CONTRIBUTING.md](https://github.com/nectar-js/nectar/blob/main/CONTRIBUTING.md).

## License

MIT. See [LICENSE](https://github.com/nectar-js/nectar/blob/main/LICENSE).
