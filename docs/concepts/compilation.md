# Compilation

`nectar build` compiles `app/` into `.nectar/manifest.json`. The runtime reads routes from the manifest and never scans `app/`.

`nectar check`, `nectar dev`, `nectar routes`, `nectar manifest`, and `nectar sync` compile the same way first.

## Checks

The compiler imports every handler file and `route.ts` to read its exports, so their top-level code runs at build time. Middleware and error files aren't imported until the bot starts.

It then checks:

- names, descriptions, option counts, and nesting against Discord's limits
- that required options come before optional ones
- that every parent command and subcommand group has a `route.ts`
- for duplicate command names and component routes that would produce the same custom IDs
- that `autocomplete.ts` exports match the options with `autocomplete: true`
- that event directories are discord.js event names
- that every `select.ts` exports a valid `kind`
- that every handler's route string matches its location

Any error fails the command:

```
✖ error  route-mismatch  app/commands/ban/command.ts
  This file is the route "ban" but its handler declares "moderation/ban". Update the string or move the file.
✖ 1 error. Fix the files above and run again.
```

Warnings don't. An event that needs an intent missing from `intents` gets a warning.

## Output

`nectar build` writes to `.nectar/`:

- `manifest.json` lists every route with its file, middleware, error boundaries, command payload, and custom ID format.
- `types.d.ts` types route paths, command options, and component parameters. Add it to `include` in `tsconfig.json`.
- `start.mjs` starts the bot from the build.

Nectar doesn't transpile your code. Node imports handlers from `app/` at runtime, so deploy `app/` along with `.nectar/`.

`nectar routes` prints the compiled route tree. `nectar manifest --route command:moderation/ban` prints one route's manifest entry, including the payload sent to Discord.
