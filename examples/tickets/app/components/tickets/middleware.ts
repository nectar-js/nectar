import { guildOnly } from "@nectar-js/nectar";

// The card only ever lives in a ticket channel, but a custom ID can be replayed from anywhere.
export default guildOnly();
