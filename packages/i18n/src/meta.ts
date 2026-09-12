import type { Locale, LocalizationMap } from "discord-api-types/v10";
import type { Vars } from "./format.js";
import { format } from "./format.js";
import type { MessageKey } from "./index.js";
import { DISCORD_LOCALES } from "./locale.js";
import { catalogs, recordMissingMeta } from "./state.js";

/**
 * The translations of `key` as Discord wants them, for `nameLocalizations` and
 * `descriptionLocalizations` in a command's `meta`:
 *
 *     export const meta: CommandMeta = {
 *       description: "Ban a member",
 *       descriptionLocalizations: localizations("ban.description"),
 *     };
 *
 * Discord shows each reader the translation for their locale and falls back to `description`.
 * A locale whose file name Discord doesn't know is left out, and a key no catalog has fails
 * the build.
 */
export function localizations(key: MessageKey, vars?: Vars): LocalizationMap {
  const map: Record<string, string> = {};
  let found = false;
  for (const [locale, catalog] of catalogs()) {
    const message = catalog.messages.get(key);
    if (message === undefined) continue;
    found = true;
    // Discord rejects the whole command when a localization map has a locale it doesn't know.
    if (DISCORD_LOCALES.has(locale)) map[locale] = format(message, locale, vars);
  }
  if (!found) recordMissingMeta(key);
  return map as Partial<Record<Locale, string>>;
}
