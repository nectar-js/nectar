# @nect-js/create

Scaffolds a new [Nect](https://github.com/OMouta/Neat) project.

```bash
npm create @nect-js
```

It asks for a directory, TypeScript or JavaScript, and a package manager, then writes a project you can read in one sitting.

```
my-bot/
  app/
    middleware.ts
    commands/ping/command.ts
    components/counter/[count]/button.ts
    events/clientReady/event.ts
  nect.config.ts
  package.json
  tsconfig.json
  .env.example
  .gitignore
```

Copy `.env.example` to `.env`, fill in `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID` from the [Developer Portal](https://discord.com/developers/applications), add your test server's ID to `dev.guilds` in `nect.config.ts`, and run `npm run dev`.

## Options

```
npm create @nect-js [directory] [options]

  --ts, --js        Language. Asked when omitted.
  --pm <name>       Package manager: npm, pnpm, yarn, or bun. Detected from the one running this.
  --yes, -y         Take the defaults instead of asking.
  --help, -h        Show this help.
```

Non-interactive runs take the defaults, so `npm create @nect-js my-bot --ts -y` works in a script.

## License

MIT. See [LICENSE](https://github.com/OMouta/Neat/blob/main/LICENSE).
