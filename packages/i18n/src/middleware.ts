import { defineMiddleware } from "@nectar-js/nectar";
import type { Interaction } from "discord.js";
import { localeFor } from "./state.js";

/**
 * Resolves the reader's locale and hands it to everything below it.
 *
 * The plugin adds this to every command and component route, and `t()` reads what it returned.
 * It is its own module because Nectar loads middleware by path, and `t()` has to be looking at
 * the same function the runtime ran.
 */
export default defineMiddleware((interaction: Interaction) => localeFor(interaction));
