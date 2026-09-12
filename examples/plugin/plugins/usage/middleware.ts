import { defineMiddleware, route, services } from "@nectar-js/nectar";
import type { UsageCommand } from "./index.ts";

export default defineMiddleware(async (interaction) => {
  // The plugin only attaches this to command routes, and the generated UsageCommand union
  // comes from the same route graph, so the path is always one of them.
  services().usage.record(route().path as UsageCommand, interaction.user.id);
});
