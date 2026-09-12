# Configuration and testing

## Options

```ts
i18n({
  dir: "locales",     // where the catalogs are, relative to nectar.config.ts
  fallback: "en-US",  // the language everything else is measured against
  source: "user",     // "guild" follows the server's language instead of the reader's
  missing: "warn",    // "error" fails the build on an incomplete language, "off" says nothing
});
```

## Check catalogs and generate types

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

Call `useLocales()` to load your test catalogs, then pass a locale with each test interaction. `createTestApp()` does not load the plugin configuration:

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
