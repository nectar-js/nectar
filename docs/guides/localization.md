# Localization

Two things get translated: what Discord shows before a command runs, and what the bot replies.

[`@nectar-js/i18n`](https://github.com/nectar-js/nectar/tree/main/packages/i18n) does both from the same catalogs. You can also do either by hand; [Without the package](#without-the-package) shows how.

## Setup

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

## Replies

`t()` translates into the locale Discord sent with the interaction, so handlers never pass a locale around:

```ts
// app/commands/ban/command.ts
import { t } from "@nectar-js/i18n";
import { defineCommand } from "@nectar-js/nectar";

export default defineCommand("ban", async (interaction, { member }) => {
  await interaction.reply(t("ban.done", { user: member.toString() }));
});
```

A French user gets French. A German user gets `en-US`, since there is no `de.json`. A `fr-CA` user gets `fr`, because Nectar falls back to the language before the fallback locale.

The plugin adds a middleware to every command, component, and autocomplete route, and `t()` reads the locale from it. That means `t()` works in your own middleware and error boundaries too, but not in an event handler, which runs without middleware. Use `translator()` there:

```ts
// app/events/guildMemberAdd/event.ts
import { translator } from "@nectar-js/i18n";
import { defineEvent } from "@nectar-js/nectar";

export default defineEvent("guildMemberAdd", async (member) => {
  const t = translator(member.guild.preferredLocale);
  await member.guild.systemChannel?.send(t("welcome", { user: member.toString() }));
});
```

To follow the server's language instead of the reader's everywhere, pass `source: "guild"` to `i18n()`. Direct messages still follow the reader.

Under `nectar dev`, an edited catalog reaches the next reply without a restart. Command names and descriptions are registered with Discord at build time, so those need a rebuild: save the `command.ts` that reads them, or restart.

## Variables and plurals

`{name}` interpolates. Numbers and dates go through `Intl`, so `{count}` reads `1,234` for an American and `1.234` for a German. `{{` and `}}` are literal braces. A variable you forget to pass stays in the reply as `{name}`, which is easier to spot than the word `undefined`.

An object whose keys are all plural forms (`zero`, `one`, `two`, `few`, `many`, `other`, or an exact number) is one message with plural forms:

```ts
t("ban.history", { user: member.toString(), count: 2 });
```

`Intl.PluralRules` picks the form for the reader's locale from `count`. An exact number wins over the category, so `"0"` above covers the case English has no plural form for.

## Command names and descriptions

`nameLocalizations` and `descriptionLocalizations` go to Discord at registration, and Discord picks the reader's language when it lists the command. `localizations()` builds them from the same catalogs:

```ts
// app/commands/ban/command.ts
import { localizations } from "@nectar-js/i18n";
import type { CommandMeta } from "@nectar-js/nectar";

export const meta: CommandMeta = {
  description: "Ban a member",
  descriptionLocalizations: localizations("ban.description"),
  options: [
    {
      type: "user",
      name: "member",
      description: "Who to ban",
      nameLocalizations: localizations("ban.target.name"),
      descriptionLocalizations: localizations("ban.target.description"),
      required: true,
    },
  ],
};
```

`description` is what Discord shows a reader whose language you haven't translated, so it stays a plain string. Choices take `nameLocalizations` the same way. Subcommand groups and parent commands set theirs in `route.ts`.

## What the build checks

`nectar build` writes every key in the fallback catalog into `.nectar/types.d.ts`, along with the variables each message interpolates:

```ts
t("ban.done", { user });   // ok
t("ban.don", { user });    // not a key
t("ban.done");             // missing user
```

It also compares the catalogs against each other:

```
▲ warning  i18n-missing-key
  fr is missing 2 of 10 messages: ban.button, welcome. Readers get en-US instead.
```

Keys nothing can reach and file names Discord doesn't recognize as locales are warnings too. A `localizations()` call for a key no catalog has is an error. Pass `missing: "error"` to `i18n()` to make an incomplete language fail the build.

`nectar i18n` prints the same comparison as a table, and `--strict` exits 1 when a language is behind:

```
locales
10 messages in en-US

  en-US  10/10
  fr      8/10  missing ban.button, welcome
```

## Testing

`createTestApp()` reads the manifest, not `nectar.config.ts`, so nothing has told the translator where the catalogs are. Point it at them once, then send a locale the way Discord would:

```ts
import { useLocales } from "@nectar-js/i18n/testing";
import { createTestApp } from "@nectar-js/nectar/testing";

useLocales(new URL("../locales", import.meta.url));

const app = createTestApp(new URL("../.nectar/manifest.json", import.meta.url));

test("answers in the reader's language", async () => {
  const { responses } = await app.command("ban", { member }, { locale: "fr" });
  expect(responses).toEqual([{ method: "reply", options: "<@42> a été banni." }]);
});
```

[`examples/i18n`](https://github.com/nectar-js/nectar/tree/main/examples/i18n) in the repository has all of this in one app.

## Policy messages

`guildOnly`, `requirePermissions`, `requireRoles`, and `cooldown` reply in English by default. Pass `message` to change it. For a per-reader language, wrap them in your own middleware, which runs below the i18n middleware and can call `t()`:

```ts
// app/commands/moderation/middleware.ts
import { t } from "@nectar-js/i18n";
import { defineMiddleware, requirePermissions } from "@nectar-js/nectar";

export default defineMiddleware((interaction) =>
  requirePermissions("BanMembers", { message: t("errors.permission") })(interaction),
);
```

## Without the package

Every interaction carries `locale`, the language of the user who sent it, and `guildLocale`, the server's setting. Return a translation function from a middleware and handlers read it with `use()`:

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
