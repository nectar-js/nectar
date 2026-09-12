# Handler context

Use these arguments and helpers inside your route handlers. For examples, see [Commands](../guides/commands), [Components](../guides/components), and [Events](../guides/events).

## Handler arguments

Handlers get the discord.js object first and the route's data second:

| Handler | Arguments |
| --- | --- |
| `command.ts` | `(interaction, options)`. Options by name, resolved through discord.js, `null` when the user left one out. Context menu commands get an empty object. |
| `button.ts`, `select.ts`, `modal.ts` | `(interaction, params)`. Parameters from the custom ID. |
| `autocomplete.ts` | `(interaction)` |
| `event.ts` | The discord.js listener arguments |
| `error.ts` | `(error, interaction)`. `interaction` is `null` when an event handler threw. |

Everything else is an import from `@nectar-js/nectar` that works inside a running route:

| Import | |
| --- | --- |
| `client()` | The discord.js client |
| `route()` | `id`, `category`, `path`, and `file` of the route |
| `env()` | `"development"`, `"test"`, or `"production"` |
| `trace()` | `id`, `receivedAt`, and `elapsed()`, the milliseconds since Discord created the interaction |
| `services()` | Services provided by plugins |
| `use(middleware)` | What a middleware above the route returned. See [Middleware](../guides/middleware). |

They read the current route from async context, so they also work in helpers a handler calls. At the top level of a module, where no route is running, they throw.

## Automatic responses

Nectar sends these responses without an explicit call in your handler:


- `meta.defer` defers a command's reply before its handler runs.
- An unhandled error gets a generic ephemeral reply, unless the interaction was already answered. If the reply was deferred, the error text goes into the deferred reply instead.
- An autocomplete handler that throws gets an empty list.
- `guildOnly`, `requirePermissions`, `requireRoles`, and `cooldown` reply when they reject an interaction.

## Unrouted interactions

Components whose custom ID doesn't start with `n:` are ignored. Commands without a route are logged as a warning and ignored. Handle either yourself in `events/interactionCreate/event.ts`, which receives every interaction.
