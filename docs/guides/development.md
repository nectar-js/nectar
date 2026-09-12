# Local development

Run `npm run dev` in a starter project, or `nectar dev` through your package manager. Set `dev.guilds` to your test server IDs in `nectar.config.ts`.

## nectar dev


`nectar dev` compiles the app, registers commands to `dev.guilds`, logs in, and watches for changes:

- Editing a handler, middleware, or error boundary reloads that file.
- Adding, moving, or deleting route files, or editing `meta`, recompiles the routes. Commands are registered again if their payloads changed.
- Editing any other source file reloads every project module.
- Editing `nectar.config.ts` restarts the client.

Only config changes reconnect to the gateway. If a change fails to compile, the previous routes keep running.

`nectar dev --verbose` also prints the route tree and discord.js warnings.

Reloading has limits:

- Module-level state resets when the module reloads.
- Timers, intervals, and connections opened at module level keep running.
- Listeners added to `client()` stay attached.
- Old versions of modules stay in memory until `nectar dev` restarts.

## Environment


`NODE_ENV` sets the environment. `production` and `test` are used as is, and anything else is `development`. Set `env` in the config to override it.

| | development | test | production |
| --- | --- | --- | --- |
| Commands register to | `dev.guilds` | `dev.guilds` | `commands.target` |
| Handlers load | on first use | on first use | at startup |
| Unhandled errors log | a full report | one line | one line |

Set `eager` in the config to choose when handlers load.

`environments` overrides config values for one environment. Each value replaces the top-level one, and objects aren't merged.

```ts
export default defineConfig({
  intents: ["Guilds"],
  logger: { level: "info" },
  environments: {
    development: { logger: { level: "debug" } },
  },
});
```

The CLI and `.nectar/start.mjs` load `.env` from the project root.

## Deploy your bot

See [Deployment](./deployment) to build and run the bot in production. Production startup loads the existing build and does not register commands.
