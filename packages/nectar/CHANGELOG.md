# @nectar-js/nectar

## 0.4.0

### Minor Changes

- 9fa869f: Handlers no longer get a `ctx` object. They get the discord.js object first and route data second: `defineCommand(path, (interaction, options) => ...)`, `defineComponent(path, (interaction, params) => ...)`, autocomplete exports take `(interaction)`, event handlers take only the discord.js listener arguments, and error boundaries take `(error, interaction)` with `interaction` null for events.
  
  Everything that used to ride on `ctx` is an import from `@nectar-js/nectar`: `client()`, `env()`, `services()`, `route()`, and `trace()`. They work inside a running route and throw at module top level.
  
  Middleware returns a value instead of calling `next()`: `return { member }` makes `use(thisMiddleware)` give `{ member }` to every handler below, typed from the middleware itself, and `return stop` ends the chain. There is no code-after-the-handler hook; the `handler:complete` signal carries timings. `MiddlewareExtension`, `InteractionContext`, `EventContext`, `CommandContext`, and `ComponentContext` are gone, and the generated `types.d.ts` no longer lists middleware per route.
  
  `createTestApp` results no longer have `context`. Assert on `responses`, `outcome`, or your own state.
  
  The `create` scaffold writes the new handler shape.

## 0.3.0

### Minor Changes

- 6f012d8: New `cooldown(seconds, options?)` middleware, next to `guildOnly` and the other policy helpers. It holds a user back from running a route again for `seconds` and tells them how long is left. `scope: "guild"` or `"global"` shares the timer more widely, and `message` can be a function of the seconds left. Timers are in memory and per process.
- 754e8cf: `meta.defer` on a `command.ts` defers the reply right before the handler runs, so a slow handler doesn't miss Discord's three second window. `true` defers a normal reply and `"ephemeral"` an ephemeral one. A middleware that already replied or deferred wins. When a handler throws after a defer, the default error boundary now fills the deferred reply instead of leaving the spinner. Command routes in the manifest gain a `defer` field.
- 764e14b: Command handlers get `ctx.options`: every option from `meta.options` by name, resolved through discord.js. Required options carry their value and the rest are `null` when left out, so `ctx.interaction.options.getUser("target", true)` becomes `ctx.options.target`. The generated route types describe each option as `{ type, required }` instead of a bare type name. Run `nectar build` after upgrading so `.nectar/types.d.ts` matches.

## 0.2.0

### Minor Changes

- 4daa49c: An unknown key in `nectar.config.ts`, like `intent` or `dev.guild`, is now an error that suggests the option you likely meant. Before, it was ignored. Remove any extra keys from your config when you upgrade.

### Patch Changes

- 279039c: Compiler diagnostics say what's wrong, why, and how to fix it, and each links to its entry in the new [diagnostics reference](https://nectar-js.github.io/nectar/reference/diagnostics). `nectar check` no longer crashes when one command is defined in two route groups, an `event.ts` that sits only in route groups is reported instead of ignored, an `autocomplete.ts` no longer gets an error of its own when its `command.ts` already failed, and a route file without a handler as its default export fails the build instead of the first interaction. The build also fails when the app has more commands than Discord allows, 100 slash commands and 15 of each context menu type, instead of `nectar sync` failing later.
- 4672cf5: Interactions and events resolve each route's file paths once instead of on every dispatch. On a 700-route app, dispatching an interaction went from about 22 µs to 8 µs.
- bc62e53: `nectar sync` keeps the Entry Point command Discord creates for apps with Activities, and any other command type Nectar doesn't declare. Before, the overwrite tried to remove it and Discord rejected it with error 50240. Syncing also fetches localizations now, so `--dry-run` no longer reports localized commands as changed when they aren't.

## 0.1.0

### Minor Changes

- First release.
