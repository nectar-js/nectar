---
"@nectar-js/nectar": patch
---

`nectar sync` keeps the Entry Point command Discord creates for apps with Activities, and any other command type Nectar doesn't declare. Before, the overwrite tried to remove it and Discord rejected it with error 50240. Syncing also fetches localizations now, so `--dry-run` no longer reports localized commands as changed when they aren't.
