import { defineEvent } from "@neatjs/core";

export default defineEvent("clientReady", async (client) => {
  console.log(`Logged in as ${client.user.tag}`);
});
