# @nectar-js/i18n

Translate your bot's replies and Discord command names and descriptions using JSON catalogs.

## Install

```sh
npm install @nectar-js/i18n
```

```ts
// nectar.config.ts
import { i18n } from "@nectar-js/i18n";
import { defineConfig } from "@nectar-js/nectar";

export default defineConfig({
  intents: ["Guilds"],
  plugins: [i18n()],
});
```

The plugin reads `locales/`, one JSON file per language, named after its locale. Nested objects flatten to dotted keys, so `ban.done` below is one message.

```json
// locales/en-US.json
{
  "ban": {
    "description": "Ban a member",
    "done": "Banned {user}.",
    "history": {
      "0": "{user} has never been banned here.",
      "one": "{user} has been banned {count} time before.",
      "other": "{user} has been banned {count} times before."
    }
  }
}
```

```json
// locales/fr.json
{
  "ban": {
    "description": "Bannir un membre",
    "done": "{user} a été banni.",
    "history": {
      "0": "{user} n'a jamais été banni ici.",
      "one": "{user} a déjà été banni {count} fois.",
      "other": "{user} a déjà été banni {count} fois."
    }
  }
}
```

## Translate a reply

```ts
// app/commands/ban/command.ts
import { t } from "@nectar-js/i18n";
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Ban a member",
  options: [
    { type: "user", name: "member", description: "Who to ban", required: true },
  ],
};

export default defineCommand("ban", async (interaction, { member }) => {
  await interaction.reply(t("ban.done", { user: member.toString() }));
});
```

Run `nectar build` to generate the message types, then `nectar dev`. This example sends a translated reply; add your moderation logic before replying.

With these catalogs, French users get French and other users get `en-US`.

- [Translate messages](./messages) covers locale selection, variables, plurals, and permission messages.
- [Translate commands](./commands) covers the names and descriptions Discord displays.
- [Configuration and testing](./reference) covers options, catalog checks, and tests.

See the [i18n example](https://github.com/nectar-js/nectar/tree/main/examples/i18n) for a complete app.
