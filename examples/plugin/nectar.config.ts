import { defineConfig } from "@nectar-js/nectar";
import { usage } from "./plugins/usage/index.ts";

export default defineConfig({
  token: process.env.DISCORD_TOKEN,
  applicationId: process.env.DISCORD_APPLICATION_ID,
  intents: ["Guilds"],
  dev: {
    guilds: process.env.DEV_GUILD_ID ? [process.env.DEV_GUILD_ID] : [],
  },
  plugins: [usage()],
});
