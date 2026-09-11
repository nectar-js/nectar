# Command registration

`nectar dev` and `nectar sync` register commands. `nectar start` never does, no matter how many processes or shards you run.

## Targets

In development and test, commands register to the guilds in `dev.guilds`. In production, they register globally, or to the guilds in `commands.target`:

```ts
// nectar.config.ts
export default defineConfig({
  intents: ["Guilds"],
  dev: { guilds: ["123456789012345678"] },
  commands: { target: "global" },
});
```

Registration needs `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID`, or `token` and `applicationId` in the config.

## When it runs

`nectar dev` registers on startup and whenever a command's payload changes.

`nectar sync` registers for the current environment. For production, run it once per deploy:

```bash
NODE_ENV=production nectar sync
```

## Syncing

For each target, `nectar sync` fetches the registered commands, compares them with the compiled payloads, and overwrites the target if anything differs. The overwrite replaces every slash command and context menu command in that target, including ones registered by other tools. Other command types, like the Entry Point command Discord creates when you enable Activities, are kept as they are.

`--dry-run` shows the changes without applying them:

```
› global: +ticket ~moderation (would apply)
```

`.nectar/registration.json` records what the last sync sent. If nothing changed since, `nectar sync` skips the fetch. Delete the file or run `nectar clean` after changing commands outside Nectar.

## Safety guard

`nectar sync` refuses to write when:

- the application ID changed since the last sync
- a target from the last sync is no longer configured
- the app has no commands and the target has some

Pass `--force` to write anyway.
