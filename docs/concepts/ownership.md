# What Nectar owns

Nectar sits between discord.js and your code. Knowing which layer does what tells you where to look when something goes wrong, and whose documentation to read.

## Nectar

- Finding the routes in `app/` and checking them before the bot runs
- Registering commands with Discord
- Encoding and decoding custom IDs
- Sending each interaction and event to its handler
- Running middleware and error boundaries in order
- Creating the discord.js client from `nectar.config.ts`, logging in, and shutting down
- Reloading handlers during development
- The manifest and the generated types

## discord.js

- The client, the gateway connection, the REST API, and the cache
- Every object a handler receives: interactions, members, guilds, channels, messages
- Responding to interactions with `reply`, `deferReply`, `update`, `showModal`, and `respond`
- Builders for messages, embeds, buttons, select menus, and modals
- Sharding, through its `ShardingManager`

Nectar doesn't wrap any of this. `ctx.interaction` is the object discord.js created, with every method the discord.js documentation lists, and `ctx.client` is the running client. Client options that Nectar has no setting for go in `client` in `nectar.config.ts`, which passes them to the discord.js `Client` constructor.

## Your code

- What each handler does, and every message the bot sends
- Who may do what. Nectar checks that a custom ID is well formed, not that the user may act on it.
- Data: databases, caches, and any state that has to survive a restart
- External APIs, queues, and scheduled work

Nectar has no database layer, no state store, and no dependency injection. Handlers and middleware import what they need, like any other Node module.

## Using discord.js directly

Anything Nectar doesn't route, you can still reach:

- `events/<name>/event.ts` listens to any discord.js event, `interactionCreate` included.
- Components whose custom IDs don't start with `n:` are yours to handle.
- `ctx.client` is available in every handler. Prefer an event route to adding listeners to it yourself: `nectar dev` rebinds event routes when files change, but it can't remove a listener it didn't add.
