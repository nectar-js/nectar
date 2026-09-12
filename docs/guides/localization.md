# Localization

Two things get translated: what Discord shows before a command runs, and what the bot replies.

## Command names and descriptions

`nameLocalizations` and `descriptionLocalizations` in `meta` are sent to Discord at registration. Discord picks the user's locale when it lists the command:

```ts
// app/commands/ban/command.ts
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Ban a member",
  descriptionLocalizations: { fr: "Bannir un membre", de: "Ein Mitglied bannen" },
  options: [
    {
      type: "user",
      name: "target",
      description: "Who to ban",
      nameLocalizations: { fr: "membre" },
      descriptionLocalizations: { fr: "Qui bannir" },
      required: true,
    },
  ],
};
```

Choices take `nameLocalizations` too. Subcommand groups and parent commands set theirs in `route.ts`. Keys are Discord locale codes like `"en-US"`, `"fr"`, and `"pt-BR"`.

## Replies

Every interaction carries `locale`, the language of the user who sent it, and `guildLocale`, the server's setting. Nectar doesn't translate replies. Return a translation function from a middleware, and handlers read it with `use()` without knowing the locale:

```ts
// app/middleware.ts
import { defineMiddleware } from "@nectar-js/nectar";
import { translator } from "./i18n.ts";

export default defineMiddleware(async (interaction) => translator(interaction.locale));
```

```ts
// app/i18n.ts
const messages = {
  "en-US": { banned: (user: string) => `Banned ${user}.` },
  fr: { banned: (user: string) => `${user} a été banni.` },
} as const;

type Locale = keyof typeof messages;

export function translator(locale: string) {
  const table = messages[locale as Locale] ?? messages["en-US"];
  return <K extends keyof typeof table>(key: K, ...args: Parameters<(typeof table)[K]>) =>
    (table[key] as (...a: typeof args) => string)(...args);
}
```

```ts
// app/commands/ban/command.ts
import { defineCommand, use } from "@nectar-js/nectar";
import i18n from "../../middleware.ts";

export default defineCommand("ban", async (interaction, { target }) => {
  const t = use(i18n);
  await interaction.reply(t("banned", target.tag));
});
```

`t` is typed from what the middleware returns. See [Middleware](./middleware#passing-values-to-handlers).

For a server-wide message, like a welcome post, use `guildLocale`. It's `null` outside a server. Event handlers have no interaction, so read `guild.preferredLocale` there.

## Policy messages

`guildOnly`, `requirePermissions`, `requireRoles`, and `cooldown` reply in English by default. Pass `message` to change it. For a per-user language, wrap them in your own middleware and pick the message from `interaction.locale` before calling the helper.
