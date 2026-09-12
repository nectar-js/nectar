# @nectar-js/create

## 0.4.0

### Minor Changes

- 9fa869f: Handlers no longer get a `ctx` object. They get the discord.js object first and route data second: `defineCommand(path, (interaction, options) => ...)`, `defineComponent(path, (interaction, params) => ...)`, autocomplete exports take `(interaction)`, event handlers take only the discord.js listener arguments, and error boundaries take `(error, interaction)` with `interaction` null for events.
  
  Everything that used to ride on `ctx` is an import from `@nectar-js/nectar`: `client()`, `env()`, `services()`, `route()`, and `trace()`. They work inside a running route and throw at module top level.
  
  Middleware returns a value instead of calling `next()`: `return { member }` makes `use(thisMiddleware)` give `{ member }` to every handler below, typed from the middleware itself, and `return stop` ends the chain. There is no code-after-the-handler hook; the `handler:complete` signal carries timings. `MiddlewareExtension`, `InteractionContext`, `EventContext`, `CommandContext`, and `ComponentContext` are gone, and the generated `types.d.ts` no longer lists middleware per route.
  
  `createTestApp` results no longer have `context`. Assert on `responses`, `outcome`, or your own state.
  
  The `create` scaffold writes the new handler shape.

## 0.3.0

No changes in this release.

## 0.2.0

### Minor Changes

- fb70576: `npm create @nectar-js` picks the language and package manager from menus, asks for the bot's token, application ID, and test server ID and writes them to `.env`, and can install dependencies and create a git repository. New projects read the test server ID from `DEV_GUILD_ID`.

## 0.1.0

### Minor Changes

- First release.
