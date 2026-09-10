# Command registration

Discord keeps its own copy of your commands. A command appears in Discord only after the bot registers it, and Discord keeps showing it, unchanged, until the bot registers again. Starting the bot doesn't touch that copy, so registration is a separate step.

## What gets registered

The compiler builds a registration payload for each command from its `meta` and from the `route.ts` files above it. Those payloads describe the commands you want. Registration compares them with the commands Discord has and writes only when they differ.

`nectar manifest --route command:moderation/ban` shows the payload for `/moderation`.

## Where

Discord stores commands in scopes: one global scope, and one per guild. Which scopes Nectar registers to depends on the environment:

| Environment | Scopes |
| --- | --- |
| `development` and `test` | The guilds in `dev.guilds`. None if the list is empty. |
| `production` | The global scope, or the guilds in `commands.target` if you list some. |

```ts
// nectar.config.ts
export default defineConfig({
  intents: ["Guilds"],
  dev: { guilds: ["123456789012345678"] },
  commands: { target: "global" },
});
```

Guild commands update in Discord right away, which is why development uses them. With `dev.guilds` empty, development registers nothing, and `nectar dev` tells you so.

A guild that has guild commands and also sees the global ones shows each command twice. A separate Discord application for development avoids that.

## When

- `nectar dev` registers to `dev.guilds` when it starts, and again whenever a change alters a command's payload.
- `nectar sync` registers for the current environment. Run `NODE_ENV=production nectar sync` once per release.
- `nectar start` and `node .nectar/start.mjs` never register. However many processes or shards run the bot, none of them writes commands.

Registration needs the bot token and the application ID. Nectar reads them from `token` and `applicationId` in the config, or from `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID`.

## How a sync works

For each scope, `nectar sync`:

1. Reads `.nectar/registration.json`. If the last sync sent this scope the same payloads, it stops there without asking Discord.
2. Fetches the commands Discord has in the scope and compares them with the payloads. Discord fills in defaults for fields you left out, so Nectar strips those from both sides first, and an unchanged command compares as unchanged.
3. Replaces the scope's commands in one request, if anything differs.

```
✔ global: +ticket ~moderation (applied)
✔ guild:123456789012345678: up to date, 4 command(s).
✔ guild:876543210987654321: unchanged since last sync.
```

`+` is a new command, `~` a changed one, and `-` a removed one. `nectar sync --dry-run` prints the same lines and writes nothing.

The replacement in step 3 leaves the scope with exactly your app's commands. Any other command in that scope is deleted, including one another tool registered.

The cache in step 1 only knows what Nectar sent. If the commands change some other way, delete `.nectar/registration.json` or run `nectar clean`, and the next sync compares with Discord again.

When Discord rejects a payload, the error names the command and the field Discord objected to.

## The safety guard

`nectar sync` refuses to write when the change looks like a mistake:

- The application ID is different from the last sync. The old application's commands stay registered.
- A scope that received commands last time is no longer a target, for example after editing `dev.guilds`. Its commands stay on Discord.
- The app declares no commands, but a scope has some. Syncing would delete all of them.

Nectar checks every scope before writing to any, so a refusal changes nothing. `nectar sync --force` goes ahead anyway, and `nectar sync --dry-run` lists what the guard would object to. Under `nectar dev`, the guard reports the problem and leaves the commands alone.
