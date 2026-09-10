# Trust boundaries

What Nectar checks, what it does not, and where your code has to.

## Custom IDs are untrusted input

Every button, select, and modal comes back with a custom ID that Discord stored on the message. Anyone who can see the message can read it, and a modified client can send any string in its place. Nectar treats every incoming custom ID as hostile:

- IDs without the `n:` prefix are not Nectar's and are ignored. Hand-built components keep working.
- Nectar IDs are decoded with a strict parser. A bad short ID, a broken escape, or the wrong number of values rejects the interaction. Nothing of yours runs.
- The short ID must name a route of the same kind. A button ID sent as a modal is rejected.
- Parameters arrive as plain strings, exactly as encoded. A route that needs more than "it is a string" declares validators:

```ts
export default defineComponent("tickets/[ticketId]/close", handler, {
  params: { ticketId: (value) => /^\d{17,20}$/.test(value) },
});
```

A validator is a function that returns `false` or throws to fail, or a Standard Schema object (zod, valibot, arktype). A failed validator rejects the interaction before middleware runs.

Rejections are logged at warn level with the route and the parameter name, never the value, and reported as an `interaction:reject` signal.

## A matching route is not authorization

Matching proves the ID has the right shape. It does not prove the user may perform the action. A user who saw a "close ticket" button can send that button's ID whether or not the ticket is theirs, and a user with a valid ID for ticket 41 can forge one for ticket 42.

Load the record, check ownership or permissions, and refuse in the handler or in a `middleware.ts` above it. The policy helpers cover the common cases:

```ts
import { requirePermissions } from "@nectar-js/nectar";

export default requirePermissions("ManageGuild");
```

`guildOnly`, `requirePermissions`, and `requireRoles` answer the user with an ephemeral message and stop the chain. They are never applied unless you import them.

## Registration permissions are a default, not a check

`defaultMemberPermissions` on a command tells Discord who sees it. Server admins can override that per role and per channel. Treat it as a UI default and keep the real check in middleware.

## Intents are yours to enable

`nectar build` and `nectar dev` warn when an event route needs an intent your config does not enable. Nectar never adds one. Privileged intents (`GuildMembers`, `GuildPresences`, `MessageContent`) must be enabled in the config and in the Discord developer portal.

## What never reaches logs or signals

Tokens, custom ID parameter values, and full interaction payloads. Framework logs carry route identity, trace ID, interaction type, command name, guild, channel, and user ID. A custom ID appears as its route prefix with parameters masked, like `n:k3f9a1:*`.

Your own logging is your own responsibility.

## Sensitive state does not belong in custom IDs

A custom ID is visible to everyone who sees the message and survives as long as the message does. Put a database key in it, not the record. Never put a secret, a signed grant, or another user's private data in one.
