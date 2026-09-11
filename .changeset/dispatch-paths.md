---
"@nectar-js/nectar": patch
---

Interactions and events resolve each route's file paths once instead of on every dispatch. On a 700-route app, dispatching an interaction went from about 22 µs to 8 µs.
