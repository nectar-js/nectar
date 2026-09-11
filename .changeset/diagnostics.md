---
"@nectar-js/nectar": patch
---

Compiler diagnostics say what's wrong, why, and how to fix it, and each links to its entry in the new [diagnostics reference](https://nectar-js.github.io/nectar/reference/diagnostics). `nectar check` no longer crashes when one command is defined in two route groups, an `event.ts` that sits only in route groups is reported instead of ignored, an `autocomplete.ts` no longer gets an error of its own when its `command.ts` already failed, and a route file without a handler as its default export fails the build instead of the first interaction.
