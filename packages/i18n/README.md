# @nectar-js/i18n

Translations for [Nectar](https://github.com/nectar-js/nectar) bots.

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

```ts
// app/commands/ban/command.ts
import { localizations, t } from "@nectar-js/i18n";
import { type CommandMeta, defineCommand } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Ban a member",
  descriptionLocalizations: localizations("ban.description"),
};

export default defineCommand("ban", async (interaction, { member }) => {
  await interaction.reply(t("ban.done", { user: member.toString() }));
});
```

Add `fr.json` and French users get French. Anyone whose language has no file gets `en-US`.

## Catalogs

Each file is named after its locale: `en-US.json`, `fr.json`, `pt-BR.json`. Nested objects flatten to dotted keys, so `ban.done` above is one message.

An object whose keys are all plural forms (`zero`, `one`, `two`, `few`, `many`, `other`, or an exact number) is one message with plural forms. `Intl.PluralRules` picks the form for the reader's locale from `count`, and an exact number wins over the category.

`{name}` interpolates. Numbers and dates go through `Intl`, so `{count}` reads `1,234` for an American and `1.234` for a German. `{{` and `}}` are literal braces. A variable you forget to pass is left in the reply as `{name}`, which is easier to spot than the word `undefined`.

## Typed keys

`nectar build` writes every key in the fallback catalog, and the variables each message interpolates, into `.nectar/types.d.ts`:

```ts
t("ban.done", { user });   // ok
t("ban.don", { user });    // not a key
t("ban.done");             // missing user
```

## Where t() works

`t()` works in command, component, and autocomplete handlers, and in any middleware or error boundary below the one the plugin adds.

Events have no reader. Use `translator()` with whatever locale fits:

```ts
export default defineEvent("guildMemberAdd", async (member) => {
  const t = translator(member.guild.preferredLocale);
  await member.guild.systemChannel?.send(t("welcome", { user: member.toString() }));
});
```

## Build and CLI

`nectar build` and `nectar check` compare every catalog against the fallback and warn about keys a language is missing, keys nothing can reach, and file names Discord doesn't recognize as locales. `localizations()` on a key no catalog has fails the build.

`nectar i18n` prints the same thing as a table. `--strict` exits 1 when a language is behind, which is what you want in CI.

```
locales
10 messages in en-US

  en-US  10/10
  fr      8/10  missing ban.button, welcome
```

## Options

```ts
i18n({
  dir: "locales",     // where the catalogs are, relative to nectar.config.ts
  fallback: "en-US",  // the language everything else is measured against
  source: "user",     // "guild" follows the server's language instead of the reader's
  missing: "warn",    // "error" fails the build on an incomplete language, "off" says nothing
});
```

## Testing

`createTestApp()` reads the manifest, not `nectar.config.ts`, so tell the translator where the catalogs are and pass a locale per interaction:

```ts
import { useLocales } from "@nectar-js/i18n/testing";

useLocales(new URL("../locales", import.meta.url));

const { responses } = await app.command("ban", { member }, { locale: "fr" });
```

[Documentation](https://nectar-js.github.io/nectar/guides/localization) ·
[Example](https://github.com/nectar-js/nectar/tree/main/examples/i18n) ·
[License](https://github.com/nectar-js/nectar/blob/main/LICENSE)
