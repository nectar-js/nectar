# Translate messages

After [setting up the package](./), use `t()` inside interaction handlers to translate a reply.

## Choose a locale

With the English and French catalogs from [Installation](./), a French user gets French. A German user gets `en-US`, since there is no `de.json`. A `fr-CA` user gets `fr`, because Nectar falls back to the language before the fallback locale.

The plugin adds a middleware to every command, component, and autocomplete route, and `t()` reads the locale from it. That means `t()` works in your own middleware and error boundaries too, but not in an event handler, which runs without middleware. Use `translator()` there. Add a `welcome` message with a `{user}` variable to your catalogs for this example:

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

Under `nectar dev`, an edited catalog reaches the next reply without a restart. For changes to command names and descriptions, rebuild and [register the commands](../../guides/command-registration).

## Variables and plurals

`{name}` interpolates. Numbers and dates go through `Intl`, so `{count}` reads `1,234` in `en-US` and `1.234` in `de`. Double a brace to write one literally. A variable you forget to pass stays in the reply as `{name}`, rather than becoming `undefined`.

An object whose keys are all plural forms (`zero`, `one`, `two`, `few`, `many`, `other`, or an exact number) is one message with plural forms:

```ts
t("ban.history", { user: member.toString(), count: 2 });
```

`Intl.PluralRules` picks the form for the reader's locale from `count`. An exact number wins over the category, so `"0"` above covers the case English has no plural form for.

## Permission and cooldown messages

`guildOnly`, `requirePermissions`, `requireRoles`, and `cooldown` reply in English by default. Pass `message` to change it. For a per-reader language, wrap them in your own middleware, which runs below the i18n middleware and can call `t()`. Add `errors.permission` to your catalogs with the rejection message:

```ts
// app/commands/moderation/middleware.ts
import { t } from "@nectar-js/i18n";
import { defineMiddleware, requirePermissions } from "@nectar-js/nectar";

export default defineMiddleware((interaction) =>
  requirePermissions("BanMembers", { message: t("errors.permission") })(interaction),
);
```
