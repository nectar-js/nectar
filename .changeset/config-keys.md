---
"@nectar-js/nectar": minor
---

An unknown key in `nectar.config.ts`, like `intent` or `dev.guild`, is now an error that suggests the option you likely meant. Before, it was ignored. Remove any extra keys from your config when you upgrade.
