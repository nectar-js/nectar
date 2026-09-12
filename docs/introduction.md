# Introduction

Nectar is a framework for Discord bots built on discord.js. Commands, components, and events are files in `app/`. Nectar registers the commands and routes each interaction to its file.

```ts
// app/commands/ping/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = { description: "Check that the bot is alive" };

export default defineCommand("ping", async (interaction) => {
  await interaction.reply("Pong.");
});
```

This file registers `/ping`. Add another directory with a `command.ts` to add another command.

Your handlers use discord.js interactions, builders, and the client directly. Nectar handles command registration, routing, middleware, error handling, and reloading during development. Import your database client and other application code where you need them.

## Build your bot

Start with [Installation](./getting-started/installation), then learn how to:

- [Organize your project](./guides/project-structure) with routes and shared code.
- [Write commands](./guides/commands) with options, subcommands, and autocomplete.
- [Handle components](./guides/components) such as buttons, menus, and modals.
- [Listen for events](./guides/events) such as a member joining a server.

For an existing bot, follow the migration guide for [discord.js](./migrating/discord-js) or [Sapphire](./migrating/sapphire).

## Add packages

The [Packages](./packages/) section covers the project creator and optional packages such as [@nectar-js/i18n](./packages/i18n/) for translations.

## Version support

Nectar is pre-1.0. Minor releases can include breaking changes. Read the [changelog](https://github.com/nectar-js/nectar/blob/main/packages/nectar/CHANGELOG.md) before upgrading and rebuild your bot after updating. See [Compatibility](./reference/compatibility) for the versioning policy.
