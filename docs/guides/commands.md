# Commands

Create a `command.ts` under `app/commands/<name>/`. Export the command's description and options as `meta`, and its handler as the default export.

## Slash commands

```ts
// app/commands/greet/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Greet someone",
  options: [
    { type: "user", name: "user", description: "Who to greet", required: true },
    { type: "string", name: "message", description: "Your greeting" },
  ],
};

export default defineCommand("greet", async (interaction, { user, message }) => {
  await interaction.reply(`${message ?? "Hello"}, ${user}!`);
});
```

This registers `/greet` with a required user and an optional message. Nectar resolves options through discord.js and passes them by name as the second argument. Omitted optional values are `null`.

Run `nectar dev` or `nectar build` to generate types for the options. Keep `.nectar/types.d.ts` in your TypeScript configuration's `include`, as the starter does.

Required options go before optional ones. See [Command metadata](../reference/files#command-ts) for all option types and settings.

## Subcommands

Each subcommand gets its own directory. Add a `route.ts` to describe the parent:

```text
app/commands/settings/
  route.ts
  show/command.ts
  reset/command.ts
```

```ts
// app/commands/settings/route.ts
import type { CommandRouteMeta } from "@nectar-js/nectar";

export const meta: CommandRouteMeta = { description: "Manage settings" };
```

The handlers declare `defineCommand("settings/show", ...)` and `defineCommand("settings/reset", ...)`. Discord displays them as `/settings show` and `/settings reset`.

For a subcommand group such as `/settings roles add`, use `settings/roles/add/command.ts`. Both `settings/` and `settings/roles/` need a `route.ts`. A directory with subcommands cannot also have a `command.ts`.

Set command-wide permissions and contexts in the top-level `route.ts`. Use [route groups](./project-structure#route-groups) to organize files without adding a subcommand level.

## Autocomplete

Set `autocomplete: true` on a string, integer, or number option. Export a function with the option's name from `autocomplete.ts` in the same directory:

```ts
// app/commands/topic/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Choose a topic",
  options: [
    { type: "string", name: "topic", description: "Topic", required: true, autocomplete: true },
  ],
};

export default defineCommand("topic", async (interaction, { topic }) => {
  await interaction.reply(`You chose ${topic}.`);
});
```

```ts
// app/commands/topic/autocomplete.ts
import type { AutocompleteInteraction } from "discord.js";

const topics = ["commands", "components", "events"];

export async function topic(interaction: AutocompleteInteraction) {
  const typed = interaction.options.getFocused();
  await interaction.respond(
    topics.filter((name) => name.startsWith(typed)).map((name) => ({ name, value: name })),
  );
}
```

Autocomplete runs the command's middleware. Return at most 25 suggestions. Users can submit values outside the suggestions, so validate them in the command if only specific values are allowed.

## Context menu commands

Set `meta.type` to `"user"` or `"message"` in a top-level command. Read the selected target from the interaction:

```ts
// app/commands/avatar/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = { type: "user", name: "View avatar" };

export default defineCommand("avatar", async (interaction) => {
  await interaction.reply(interaction.targetUser.displayAvatarURL());
});
```

Context menu commands have no description or options. A message command reads `interaction.targetMessage` instead.

## Replies that take longer

For commands that may take more than three seconds, set `meta.defer` to `true` or `"ephemeral"`. Nectar defers the reply after middleware runs and before calling your handler. Answer with `interaction.editReply()` instead of `reply()`.

If middleware already replied or deferred, Nectar leaves the interaction alone. Components must call `deferUpdate()` or `deferReply()` themselves.

## Register commands

`nectar dev` registers command changes in your test servers. Production registration is a separate step. See [Command registration](./command-registration).
