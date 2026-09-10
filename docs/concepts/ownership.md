# What Nectar owns

Nectar handles route discovery, command registration, custom IDs, dispatch, middleware, error boundaries, starting and stopping the client, and reloading in development.

Everything else is discord.js. Nectar doesn't wrap discord.js objects: `ctx.interaction` and `ctx.client` are the originals, so replies, builders, and caching work as the discord.js docs describe. Pass extra client options through `client` in `nectar.config.ts`.

Nectar doesn't include a database layer, state management, or dependency injection. Import what you need in handlers and middleware.

To work with discord.js directly, add an event route for any client event, including `interactionCreate`, or use `ctx.client` in a handler. Listeners you add to `ctx.client` yourself aren't removed when `nectar dev` reloads a file.
