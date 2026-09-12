import { guildOnly } from "@nectar-js/nectar";

// Tickets belong to a server. In a DM this replies and stops the chain.
export default guildOnly({ message: "Open tickets from inside the server." });
