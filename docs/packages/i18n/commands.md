# Translate commands

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
      required: true,
    },
  ],
};
```

`description` is what Discord shows a reader whose language you haven't translated, so it stays a plain string. Choices take `nameLocalizations` the same way. Subcommand groups and parent commands set theirs in `route.ts`.

Add a message key to each catalog before passing it to `localizations()`. For example, add `ban.target.name` to translate the `member` option name.

## Register changes

After editing command translations, run `nectar sync` for the target environment. During development, save the command file that reads the translations or restart `nectar dev` to rebuild and register them. See [Command registration](../../guides/command-registration).
