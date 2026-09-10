# CLI

Run `nectar` from the directory that contains `nectar.config.ts`. It loads `.env` from that directory first.

`nectar --help` lists the commands, `nectar <command> --help` shows one command's options, and `nectar --version` prints the version.

Exit codes are `0` for success, `1` when the command fails, and `2` for an unknown command or invalid options.

## `nectar dev`

```bash
nectar dev [--verbose]
```

Compiles the app, writes `.nectar/`, registers commands to `dev.guilds`, logs in, and reloads on changes. See [Development and production](../concepts/dev-and-production#nectar-dev).

`--verbose` adds the route tree after each rebuild, debug logs, and discord.js warnings.

Needs `DISCORD_TOKEN`. Without `DISCORD_APPLICATION_ID`, it runs without registering commands.

## `nectar build`

Compiles the app and writes `manifest.json`, `types.d.ts`, and `start.mjs` to `.nectar/`. Fails on any compile error.

## `nectar check`

Compiles the app and prints problems without writing anything.

## `nectar routes`

Prints the route tree with each command's name, each component's custom ID pattern, each event, and how many routes each middleware and error boundary covers.

## `nectar manifest`

```bash
nectar manifest [--route <id>]
```

Prints the compiled manifest as JSON. `--route` takes a route ID like `command:moderation/ban` or a path like `moderation/ban`, and prints that route along with its command payload, custom ID pattern, or event handlers.

## `nectar sync`

```bash
nectar sync [--dry-run] [--force]
```

Registers commands for the current environment. `--dry-run` shows the changes without applying them, and `--force` applies changes the safety guard would refuse. See [Command registration](../concepts/registration).

Needs `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID`.

## `nectar start`

Runs the bot from the last build, the same as `node .nectar/start.mjs`. Needs `DISCORD_TOKEN`.

## `nectar clean`

Deletes `.nectar/`, including the registration cache.

## `nectar info`

Prints the Nectar, Node, and discord.js versions, whether `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID` are set, the environment, and a summary of the config.

## Colors

Output is colored in a terminal. Set `NO_COLOR` to turn colors off, or `FORCE_COLOR` to keep them in piped output.

## `npm create @nectar-js`

```bash
npm create @nectar-js [directory] -- [--ts | --js] [--pm <name>] [--yes]
```

Creates a new project in `directory`, which has to be empty or not exist yet. It asks for anything you leave out. npm needs the `--` before the options, and pnpm, yarn, and bun don't.

| Option | |
| --- | --- |
| `--ts`, `--js` | The language |
| `--pm <name>` | `npm`, `pnpm`, `yarn`, or `bun`. Defaults to the package manager running the command. |
| `--yes`, `-y` | Uses the defaults instead of asking: `my-bot`, TypeScript, and the detected package manager |
