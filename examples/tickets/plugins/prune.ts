import { definePlugin } from "@nectar-js/nectar";
import { pruneClosedTickets } from "../app/tickets.ts";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Deletes tickets `afterDays` after they close, checking every `everyMs`. The timer starts in
 * `startGlobal`, so it runs once for the bot however it is sharded, and stops with the bot.
 */
export function prune({ afterDays = 7, everyMs = 60 * 60 * 1000 } = {}) {
  let timer: NodeJS.Timeout | undefined;

  return definePlugin({
    name: "prune",

    startGlobal(app) {
      timer = setInterval(() => {
        // Timers have no error boundary, so failures are caught and logged here.
        try {
          const removed = pruneClosedTickets(Date.now() - afterDays * DAY);
          if (removed > 0) app.logger.info(`Pruned ${removed} closed tickets.`);
        } catch (error) {
          app.logger.error("Pruning tickets failed.", { error });
        }
      }, everyMs);
    },

    stopGlobal() {
      clearInterval(timer);
    },
  });
}
