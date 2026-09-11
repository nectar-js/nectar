# Reserved files

## command.ts

A slash command, subcommand, or context menu command. It goes under `commands/`, at most three levels deep, not counting route groups.

```ts
// app/commands/moderation/ban/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Ban a member",
  options: [
    { type: "user", name: "target", description: "Who to ban", required: true },
    { type: "string", name: "reason", description: "Why", maxLength: 512 },
  ],
};

export default defineCommand("moderation/ban", async (ctx) => {
  const target = ctx.interaction.options.getUser("target", true);
  await ctx.interaction.reply(`Banned ${target.tag}.`);
});
```

`ctx.interaction` is a `ChatInputCommandInteraction`, `UserContextMenuCommandInteraction`, or `MessageContextMenuCommandInteraction`, depending on `meta.type`.

`meta` is required:

| Field | |
| --- | --- |
| `description` | 1 to 100 characters. Required for slash commands, not allowed on context menu commands. |
| `name` | Replaces the directory name. |
| `type` | `"chatInput"`, `"user"`, or `"message"`. Defaults to `"chatInput"`. |
| `options` | Up to 25 options. Slash commands only. |
| `nameLocalizations` | Names by locale. |
| `descriptionLocalizations` | Descriptions by locale. |
| `defaultMemberPermissions` | Permission bitfield, like `PermissionFlagsBits.BanMembers`. |
| `nsfw` | Marks the command as age-restricted. |
| `contexts` | `InteractionContextType` values. |
| `integrationTypes` | `ApplicationIntegrationType` values. |

The last four only apply to top-level commands. For a command with subcommands, set them in its `route.ts`.

### Options

Each option has a `type`, a `name` of 1 to 32 lowercase characters, and a `description` of 1 to 100 characters. `required`, `nameLocalizations`, and `descriptionLocalizations` are optional. Required options have to come before optional ones.

| Type | Extra fields |
| --- | --- |
| `"string"` | `choices`, `autocomplete`, `minLength`, `maxLength` |
| `"integer"`, `"number"` | `choices`, `autocomplete`, `minValue`, `maxValue` |
| `"channel"` | `channelTypes` |
| `"boolean"`, `"user"`, `"role"`, `"mentionable"`, `"attachment"` | None |

`choices` takes up to 25 `{ name, value }` objects and can't be combined with `autocomplete`. `channelTypes` takes discord.js `ChannelType` values.

## route.ts

Describes a command with subcommands, or a subcommand group. Both need one.

```ts
// app/commands/moderation/route.ts
import type { CommandRouteMeta } from "@nectar-js/nectar";
import { PermissionFlagsBits } from "discord.js";

export const meta: CommandRouteMeta = {
  description: "Moderation tools",
  defaultMemberPermissions: PermissionFlagsBits.BanMembers,
};
```

`meta` takes `description`, which is required, and `name`, `nameLocalizations`, and `descriptionLocalizations`. The `route.ts` of a top-level command also takes `defaultMemberPermissions`, `nsfw`, `contexts`, and `integrationTypes`.

A `route.ts` in a directory without subcommands has no effect and gets a warning.

## autocomplete.ts

Autocomplete for the `command.ts` in the same directory. Export one function for each option with `autocomplete: true`, named after the option.

```ts
// app/commands/user/profile/autocomplete.ts
import type { InteractionContext } from "@nectar-js/nectar";
import type { AutocompleteInteraction } from "discord.js";

const sections = ["overview", "activity", "badges"];

export async function section(ctx: InteractionContext<AutocompleteInteraction>) {
  const typed = ctx.interaction.options.getFocused();
  await ctx.interaction.respond(
    sections.filter((s) => s.startsWith(typed)).map((s) => ({ name: s, value: s })),
  );
}
```

The compiler fails if an option has no function or a function has no option. Autocomplete runs the same middleware as its command.

## button.ts

```ts
// app/components/tickets/[ticketId]/close/button.ts
import { defineComponent } from "@nectar-js/nectar";

export default defineComponent("tickets/[ticketId]/close", async (ctx) => {
  await ctx.interaction.update({ content: `Closed ${ctx.params.ticketId}.`, components: [] });
});
```

`ctx.interaction` is a `ButtonInteraction`, and `ctx.params` holds the route's parameters. The third argument of `defineComponent` takes parameter validators. See [Custom IDs](../concepts/custom-ids#validation).

## select.ts

```ts
// app/components/tickets/[ticketId]/assign/select.ts
import { defineComponent } from "@nectar-js/nectar";

export const kind = "user";

export default defineComponent("tickets/[ticketId]/assign", async (ctx) => {
  const user = ctx.interaction.users.first();
  await ctx.interaction.update({ content: `Assigned to ${user?.tag}.` });
});
```

`kind` is required: `"string"`, `"user"`, `"role"`, `"channel"`, or `"mentionable"`. `ctx.interaction` is the matching discord.js select menu interaction.

## modal.ts

Works like `button.ts`, with a `ModalSubmitInteraction`.

## event.ts

```ts
// app/events/guildMemberAdd/event.ts
import { defineEvent, type EventMeta } from "@nectar-js/nectar";

export const meta: EventMeta = { order: 1 };

export default defineEvent("guildMemberAdd", async (member) => {
  console.log(`${member.user.tag} joined ${member.guild.name}`);
});
```

It goes in `events/<name>/`, or in a route group inside it like `events/<name>/(welcome)/`. The handler gets the discord.js listener arguments followed by `ctx`, which has `client`, `route`, `env`, and `services`.

`meta` is optional:

| Field | |
| --- | --- |
| `order` | Handlers of one event run in ascending order. Defaults to `0`, and ties sort by route ID. |
| `mode` | `"sequential"` or `"concurrent"`. Defaults to `"sequential"`. It applies to every handler of the event, so handlers that set it have to agree. |
| `once` | Runs the handler for the first event only. |

## middleware.ts

```ts
// app/middleware.ts
import { defineMiddleware } from "@nectar-js/nectar";

export default defineMiddleware(async (ctx, next) => {
  return next({ startedAt: Date.now() });
});
```

Runs before every command, autocomplete, and component handler in its directory and below, starting from `app/`. It can go in any directory. See [Middleware and errors](../concepts/middleware-and-errors).

## error.ts

```ts
// app/error.ts
import { defineError } from "@nectar-js/nectar";

export default defineError(async (error, ctx) => {
  console.error(ctx.route.id, error);
  return "unhandled";
});
```

Handles errors from handlers and middleware in its directory and below, nearest first. Return `"unhandled"` or throw to pass the error to the next one. For event handlers, `ctx` has no `interaction`.
