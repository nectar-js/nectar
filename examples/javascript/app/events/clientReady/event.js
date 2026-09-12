import { defineEvent } from "@nectar-js/nectar";

export default defineEvent("clientReady", async (client) => {
  console.log(`Logged in as ${client.user.tag}`);
});
