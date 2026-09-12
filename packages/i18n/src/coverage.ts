import type { Catalog } from "./catalog.js";
import { DISCORD_LOCALES } from "./locale.js";

export interface LocaleCoverage {
  locale: string;
  /** Keys the fallback locale has that this one doesn't. */
  missing: string[];
  /** Keys this locale has that the fallback doesn't, usually a rename left behind. */
  extra: string[];
  /** Discord refuses a localization map keyed by a locale it doesn't know. */
  known: boolean;
}

export interface Coverage {
  fallback: string;
  /** Number of keys in the fallback locale, which every other one is measured against. */
  total: number;
  locales: LocaleCoverage[];
}

/** Compares every catalog against the fallback locale. */
export function coverageOf(catalogs: ReadonlyMap<string, Catalog>, fallback: string): Coverage {
  const base = catalogs.get(fallback);
  const baseKeys = new Set(base?.messages.keys() ?? []);
  const locales: LocaleCoverage[] = [];
  for (const [locale, catalog] of catalogs) {
    const keys = new Set(catalog.messages.keys());
    locales.push({
      locale,
      missing: locale === fallback ? [] : [...baseKeys].filter((key) => !keys.has(key)).sort(),
      extra: locale === fallback ? [] : [...keys].filter((key) => !baseKeys.has(key)).sort(),
      known: DISCORD_LOCALES.has(locale),
    });
  }
  locales.sort((a, b) => a.locale.localeCompare(b.locale));
  return { fallback, total: baseKeys.size, locales };
}

/** Keeps a diagnostic readable when a locale has just been started and misses everything. */
export function listKeys(keys: readonly string[], limit = 5): string {
  const shown = keys.slice(0, limit).join(", ");
  return keys.length > limit ? `${shown}, and ${keys.length - limit} more` : shown;
}

/** "1 message", "3 messages". */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
