import { Locale } from "discord-api-types/v10";

/** Every locale code Discord accepts, spelled the way Discord spells it. */
export const DISCORD_LOCALES: ReadonlySet<string> = new Set<string>(Object.values(Locale));

/** `pt-BR` and `pt` share the language `pt`. */
function language(locale: string): string {
  const dash = locale.indexOf("-");
  return dash === -1 ? locale : locale.slice(0, dash);
}

/**
 * The catalog to use for `wanted`: the exact locale, then the language it belongs to, then
 * another locale in the same language, then `fallback`. So a `pt-BR` user reads a `pt` catalog,
 * and a `pt` user reads `pt-BR` when that is the only Portuguese there is.
 */
export function matchLocale(
  wanted: string | null | undefined,
  available: ReadonlySet<string>,
  fallback: string,
): string {
  if (wanted === null || wanted === undefined || wanted === "") return fallback;
  if (available.has(wanted)) return wanted;
  const base = language(wanted);
  if (available.has(base)) return base;
  for (const locale of available) {
    if (language(locale) === base) return locale;
  }
  return fallback;
}
