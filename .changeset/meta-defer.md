---
"@nectar-js/nectar": minor
---

`meta.defer` on a `command.ts` defers the reply right before the handler runs, so a slow handler doesn't miss Discord's three second window. `true` defers a normal reply and `"ephemeral"` an ephemeral one. A middleware that already replied or deferred wins. When a handler throws after a defer, the default error boundary now fills the deferred reply instead of leaving the spinner. Command routes in the manifest gain a `defer` field.
