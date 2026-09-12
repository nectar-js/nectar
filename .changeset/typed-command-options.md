---
"@nectar-js/nectar": minor
---

Command handlers get `ctx.options`: every option from `meta.options` by name, resolved through discord.js. Required options carry their value and the rest are `null` when left out, so `ctx.interaction.options.getUser("target", true)` becomes `ctx.options.target`. The generated route types describe each option as `{ type, required }` instead of a bare type name. Run `nectar build` after upgrading so `.nectar/types.d.ts` matches.
