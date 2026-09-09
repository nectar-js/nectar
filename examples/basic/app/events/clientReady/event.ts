import { defineEvent } from "@nect-js/core";

export default defineEvent("clientReady", async (client) => {
  console.log(`Logged in as ${client.user.tag}`);
});
