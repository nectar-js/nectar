---
"@nectar-js/nectar": minor
---

New `cooldown(seconds, options?)` middleware, next to `guildOnly` and the other policy helpers. It holds a user back from running a route again for `seconds` and tells them how long is left. `scope: "guild"` or `"global"` shares the timer more widely, and `message` can be a function of the seconds left. Timers are in memory and per process.
