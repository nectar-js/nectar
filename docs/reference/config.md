# Configuration

The config is `nectar.config.ts` in the project root, or `nectar.config.js` in JavaScript projects. Run `nectar` from the directory that contains it. The CLI loads `.env` before the config, so `process.env` is filled in.

```ts
// nectar.config.ts
import { defineConfig } from "@nectar-js/nectar";

export default defineConfig({
  token: process.env.DISCORD_TOKEN,
  applicationId: process.env.DISCORD_APPLICATION_ID,
  intents: ["Guilds"],
  dev: { guilds: ["123456789012345678"] },
});
```

Nectar validates the config on load and names the key that's wrong. A key that isn't one of the options below is an error too, so a misspelled option doesn't get ignored.

## `token`

The bot token. Defaults to the `DISCORD_TOKEN` environment variable.

## `applicationId`

The application ID, used to register commands. Defaults to `DISCORD_APPLICATION_ID`.

## `intents`

Required. Gateway intents in any form discord.js accepts, such as `["Guilds", "GuildMembers"]`. Use `[]` for none.

The compiler warns when an event route needs an intent that's missing. Privileged intents also have to be enabled in the Developer Portal.

## `partials`

discord.js partials, such as `[Partials.Message]`.

## `client`

Other discord.js `ClientOptions`. `intents` and `partials` take precedence over the same keys here.

## `eager`

Imports every handler at startup instead of on first use. Defaults to `true` in production and `false` otherwise.

## `env`

`"development"`, `"test"`, or `"production"`. Overrides `NODE_ENV`.

## `environments`

Overrides for one environment. Each key replaces the top-level value, and nested objects aren't merged. `env` and `environments` can't be overridden.

```ts
environments: {
  production: { logger: { level: "warn" } },
},
```

## `appDir`

The routes directory, relative to the project root. Defaults to `"app"`.

## `outDir`

The build directory, relative to the project root. Defaults to `".nectar"`.

## `dev.guilds`

Guild IDs that get the commands in development and test. With none, those environments don't register commands.

## `commands.target`

Where production registers commands: `"global"`, or an array of guild IDs. Defaults to `"global"`.

## `logger`

Framework logs. Without a `sink`, `nectar start` prints them to the console and `nectar dev` prints them in its own format. `nectar dev --verbose` lowers the level to `"debug"`.

| Field | |
| --- | --- |
| `level` | `"debug"`, `"info"`, `"warn"`, or `"error"`. Defaults to `"info"`. |
| `sink` | Receives every log record instead of the console. |

```ts
import pino from "pino";

const log = pino();

export default defineConfig({
  intents: ["Guilds"],
  logger: {
    sink: ({ level, message, fields }) => log[level](fields, message),
  },
});
```

A record has `level`, `message`, `at` in epoch milliseconds, and `fields`. Fields carry the route ID, trace ID, interaction type, command name, guild, channel, and user, with the thrown value under `error`. Tokens, custom ID parameter values, and interaction payloads are never logged.

## `observe`

Called with every framework signal. Listeners run synchronously, and one that throws is logged and skipped.

```ts
observe(signal) {
  if (signal.type === "interaction:complete") {
    metrics.timing(signal.route.id, signal.duration);
  }
},
```

| Signal | Fields |
| --- | --- |
| `interaction:start` | `trace`, `interaction` |
| `route:match` | `trace`, `interaction`, `route` |
| `middleware:enter` | `trace`, `interaction`, `route`, `file` |
| `handler:enter` | `trace`, `interaction`, `route` |
| `handler:complete` | `trace`, `interaction`, `route`, `duration` |
| `interaction:complete` | `trace`, `interaction`, `route`, `duration`, `handled` |
| `interaction:fail` | `trace`, `interaction`, `route`, `error`, `boundary` |
| `interaction:reject` | `trace`, `interaction`, `reason`, and for a failed validator `route` and `param` |
| `event:fail` | `event`, `route`, `error`, `boundary` |
| `registration:start` | `scopes` |
| `registration:complete` | `scopes`, `duration` |
| `gateway:connect` | `shard`, `resumed` |
| `gateway:disconnect` | `shard`, `code` |
| `shutdown` | |

Every signal also has `at`. `trace` is the interaction ID. `interaction` has `type`, `command`, `customId`, `guildId`, `channelId`, and `userId`, with custom ID parameter values replaced by `*`. `boundary` is the `error.ts` that handled the error, or `null` if none did. `handled` is `false` when middleware stopped the chain.

The `reason` of a rejection is `no-route`, `unknown-interaction`, `malformed`, `unknown-route`, `param-count`, or `invalid-param`.

Registration signals only come from `nectar dev`.

## `plugins`

Plugins, in the order their hooks run. See [Plugins](./plugins).
