# Scheduled jobs

Nectar has no job runner. A job is a timer started by a plugin's `startGlobal` hook, which runs once for the whole bot however it's sharded, and cleared in `stopGlobal`.

```ts
// plugins/prune.ts
import { definePlugin } from "@nectar-js/nectar";
import { pruneClosedTickets } from "../tickets.ts";

const HOUR = 60 * 60 * 1000;

export function prune() {
  let timer: NodeJS.Timeout | undefined;

  return definePlugin({
    name: "prune",

    startGlobal(app) {
      timer = setInterval(async () => {
        // startGlobal runs before login, so the first ticks may come before the gateway is up.
        if (!app.client.isReady()) return;
        try {
          const removed = await pruneClosedTickets();
          app.logger.info(`Pruned ${removed} tickets.`);
        } catch (error) {
          app.logger.error("Prune failed.", { error });
        }
      }, HOUR);
    },

    stopGlobal() {
      clearInterval(timer);
    },
  });
}
```

```ts
// nectar.config.ts
import { defineConfig } from "@nectar-js/nectar";
import { prune } from "./plugins/prune.ts";

export default defineConfig({
  intents: ["Guilds"],
  plugins: [prune()],
});
```

`app` has `client`, `env`, `logger`, `signals`, and `manifest`. See [Plugins](../reference/plugins).

Catch errors inside the tick. Error boundaries only cover interactions and events, and a rejected promise from a timer is an unhandled rejection.

## Why a plugin

A `setInterval` at the top of a handler file runs in every shard process and, in development, starts again on every reload of that file without the old one stopping. `startGlobal` runs once, and `stopGlobal` runs on shutdown, so the timer has an owner.

## Cron schedules

For a schedule like "every Monday at 09:00", use a cron library such as `croner` in `startGlobal` and stop it in `stopGlobal`. Nectar doesn't include one.

## Timers with an interaction

A job started from a command, like a reminder, belongs in the handler. Keep the timer's state somewhere that survives a restart, such as a database row with a due time that the plugin above polls. A `setTimeout` alone is lost when the process stops.
