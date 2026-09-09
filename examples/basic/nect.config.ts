import { defineConfig } from "@nect-js/core";

export default defineConfig({
  token: process.env.DISCORD_TOKEN,
  applicationId: process.env.DISCORD_APPLICATION_ID,
  intents: ["Guilds", "GuildMembers"],
  dev: {
    // Each developer points this at their own test server through .env.
    guilds: process.env.DEV_GUILD_ID ? [process.env.DEV_GUILD_ID] : [],
  },
});
