# Localization

To manage translations in JSON catalogs, install [@nectar-js/i18n](../packages/i18n/). It translates replies and generates command localizations from the same messages.

## Command names and descriptions

You can also set `nameLocalizations` and `descriptionLocalizations` directly in command metadata:

```ts
import type { CommandMeta } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Check that the bot is alive",
  descriptionLocalizations: { fr: "Vérifier que le bot répond" },
};
```

These fields also work on command options and in `route.ts`. Choices accept `nameLocalizations`. Run [command registration](./command-registration) after changing them.

## Replies

Use `interaction.locale` for the user's language or `interaction.guildLocale` for the server's language. `guildLocale` is `null` outside a server. Pass the locale to your translation library or choose the reply yourself:

```ts
await interaction.reply(interaction.locale === "fr" ? "Bonjour !" : "Hello!");
```

In an event handler, use `guild.preferredLocale` for server messages. To share a translator across handlers, return it from [middleware](./middleware#passing-values-to-handlers).
