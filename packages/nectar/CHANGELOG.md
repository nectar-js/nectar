# @nectar-js/nectar

## 0.2.0

### Minor Changes

- 4daa49c: An unknown key in `nectar.config.ts`, like `intent` or `dev.guild`, is now an error that suggests the option you likely meant. Before, it was ignored. Remove any extra keys from your config when you upgrade.

### Patch Changes

- 279039c: Compiler diagnostics say what's wrong, why, and how to fix it, and each links to its entry in the new [diagnostics reference](https://nectar-js.github.io/nectar/reference/diagnostics). `nectar check` no longer crashes when one command is defined in two route groups, an `event.ts` that sits only in route groups is reported instead of ignored, an `autocomplete.ts` no longer gets an error of its own when its `command.ts` already failed, and a route file without a handler as its default export fails the build instead of the first interaction. The build also fails when the app has more commands than Discord allows, 100 slash commands and 15 of each context menu type, instead of `nectar sync` failing later.
- 4672cf5: Interactions and events resolve each route's file paths once instead of on every dispatch. On a 700-route app, dispatching an interaction went from about 22 µs to 8 µs.
- bc62e53: `nectar sync` keeps the Entry Point command Discord creates for apps with Activities, and any other command type Nectar doesn't declare. Before, the overwrite tried to remove it and Discord rejected it with error 50240. Syncing also fetches localizations now, so `--dry-run` no longer reports localized commands as changed when they aren't.

## 0.1.0

### Minor Changes

- First release.
