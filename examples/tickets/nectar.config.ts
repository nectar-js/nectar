import { defineConfig } from "@nectar-js/nectar";
import { prune } from "./plugins/prune.ts";

export default defineConfig({
  token: process.env.DISCORD_TOKEN,
  applicationId: process.env.DISCORD_APPLICATION_ID,
  intents: ["Guilds"],
  dev: {
    guilds: process.env.DEV_GUILD_ID ? [process.env.DEV_GUILD_ID] : [],
  },
  plugins: [prune({ afterDays: 7 })],
});
