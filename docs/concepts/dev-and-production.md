# Development and production

Two things decide how the bot runs: the command that started it, and the environment.

`nectar dev` runs from source. It compiles `app/`, watches the project, and applies your changes while the bot stays connected. `nectar start` and `node .nectar/start.mjs` run the output of the last `nectar build`, and never look through `app/` for routes.

## The environment

The environment comes from `NODE_ENV`. `production` and `test` are taken as they are, and any other value, or none, means `development`. Setting `env` in the config overrides `NODE_ENV`.

| | `development` | `test` | `production` |
| --- | --- | --- | --- |
| Commands register to | `dev.guilds` | `dev.guilds` | `commands.target`, global by default |
| Handlers are imported | on first use | on first use | all at startup |
| Unhandled errors are logged as | a full report | one line | one line |

Set `eager` in the config to choose when handlers are imported, whatever the environment.

`environments` in the config replaces top-level settings for one environment:

```ts
export default defineConfig({
  intents: ["Guilds"],
  logger: { level: "info" },
  environments: {
    development: { logger: { level: "debug" } },
  },
});
```

Each key replaces the top-level value as a whole. Nested objects aren't merged.

Every `nectar` command loads `.env` from the project root when there is one, and so does `start.mjs`.

## Development

`nectar dev` compiles the app, writes `.nectar/`, registers the commands in `dev.guilds`, and logs in. Then it watches the project and handles each change with the smallest update that keeps the bot correct:

| You change | What happens |
| --- | --- |
| The code of a handler, middleware, or error boundary | Nectar imports that file again. The next interaction runs the new code. |
| The routes: a reserved file or directory added, moved, or removed, or a `meta` edited | Nectar recompiles and swaps in the new routes and event listeners. If a command's payload changed, it registers the commands again. |
| Any other source file, such as a helper a handler imports | Every project module is imported again on its next use, because Nectar doesn't track which handlers import which files. |
| `nectar.config.ts` | The client disconnects and a new one logs in with the new config. |

Only a config change reconnects to the gateway. A compile error keeps the previous routes and handlers running until you fix the file.

When an error reaches the default boundary in development, the log names the route and its file, describes the interaction with its guild, channel, and user, gives the time since Discord created it, lists the middleware that ran, and prints the stack. `nectar dev --verbose` also prints the route tree after every rebuild, along with discord.js's warnings.

### What reloading can't do

Reloading imports a new copy of a module. The old copy keeps whatever it set up:

- Module-level state starts over. A `Map` at the top of a handler file is empty again after you save. Keep state that has to outlive a save in a database or a file.
- Timers, intervals, and connections opened at the top level of a module keep running after it reloads. Clean them up, or don't start them at import time.
- Listeners you add to `ctx.client` stay attached, and the next copy adds another one. Event routes don't have this problem, because Nectar rebinds them itself.
- Old copies stay in memory until the process exits, since ESM modules can't be unloaded. Restart `nectar dev` after a long session.

## Production

```bash
nectar build
NODE_ENV=production node .nectar/start.mjs
```

`nectar build` compiles the app and writes `manifest.json`, `types.d.ts`, and `start.mjs` to `.nectar/`. It fails on any compile error. `start.mjs` does the same as `nectar start`, from any working directory, and it's the file to give a discord.js `ShardingManager`.

When the bot starts in production, the runtime loads the config and the manifest, then imports every handler, middleware, and error boundary the manifest lists. A file that fails to import stops the bot before it logs in, instead of failing the first interaction that needs it. Then it attaches its listeners and logs in.

It doesn't compile, doesn't look through `app/` for routes, and doesn't register commands. Run `nectar sync` for that, once per release.

In production, an unhandled error is logged as one line with the route ID and file, followed by the error. The user sees only the generic ephemeral reply.

On SIGINT or SIGTERM, the bot stops taking interactions, waits up to 10 seconds for the ones in progress, and disconnects. A second signal exits right away. [Deploying](../guides/deployment) has setups for Docker, PM2, and systemd.
