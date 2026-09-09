import { defineConfig } from "@neatjs/core";

export default defineConfig({
  intents: ["Guilds", "GuildMembers"],
  dev: {
    guilds: [],
  },
});
