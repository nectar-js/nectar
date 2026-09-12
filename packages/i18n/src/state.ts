import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "@nectar-js/nectar";
import { type Catalog, loadCatalogs } from "./catalog.js";
import { matchLocale } from "./locale.js";

export interface I18nOptions {
  /**
   * Directory holding one `<locale>.json` per language. A relative path resolves against the
   * directory Nectar runs in, next to `nectar.config.ts`. Defaults to `locales`.
   */
  dir?: string | URL;
  /**
   * The locale a reader gets when theirs is not translated, and the one `nectar i18n` and the
   * build compare the others against. Defaults to `"en-US"`.
   */
  fallback?: string;
  /**
   * Whether a reply follows the reader (`"user"`, the default) or the server they are in
   * (`"guild"`). A direct message always follows the reader.
   */
  source?: "user" | "guild";
  /** How the build reports a key one locale is missing. Defaults to `"warn"`. */
  missing?: "warn" | "error" | "off";
}

export interface Settings {
  dir: string;
  fallback: string;
  source: "user" | "guild";
  missing: "warn" | "error" | "off";
}

/**
 * One set of catalogs per process, configured by `i18n()` in `nectar.config.ts`. The compiler,
 * the bot, and the handlers all read the same one, so `t()` needs nothing passed to it.
 */
let settings: Settings = defaults();
let loaded: Map<string, Catalog> | null = null;
let logger: Logger | null = null;
const warned = new Set<string>();

/** Keys `localizations()` asked for that no catalog has. The build turns these into errors. */
const missingMeta = new Set<string>();

function defaults(): Settings {
  return {
    dir: path.resolve(process.cwd(), "locales"),
    fallback: "en-US",
    source: "user",
    missing: "warn",
  };
}

export function configure(options: I18nOptions = {}): Settings {
  const dir =
    options.dir === undefined
      ? defaults().dir
      : options.dir instanceof URL
        ? fileURLToPath(options.dir)
        : path.resolve(process.cwd(), options.dir);
  settings = {
    dir,
    fallback: options.fallback ?? "en-US",
    source: options.source ?? "user",
    missing: options.missing ?? "warn",
  };
  loaded = null;
  warned.clear();
  missingMeta.clear();
  return settings;
}

export function current(): Settings {
  return settings;
}

/** The catalogs, read from disk on first use and kept for the life of the process. */
export function catalogs(): Map<string, Catalog> {
  loaded ??= loadCatalogs(settings.dir);
  return loaded;
}

/** Reads the catalogs again. `nectar dev` calls this when a catalog file changes. */
export function reload(): Map<string, Catalog> {
  loaded = null;
  warned.clear();
  return catalogs();
}

export function setLogger(value: Logger | null): void {
  logger = value;
}

/** Reports a problem in a message once, so a popular command doesn't flood the log. */
export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  logger?.warn(message, { plugin: "i18n" });
}

export function recordMissingMeta(key: string): void {
  missingMeta.add(key);
}

export function takeMissingMeta(): string[] {
  const keys = [...missingMeta].sort();
  missingMeta.clear();
  return keys;
}

/** The catalog locale for an interaction, from `source` and what the catalogs cover. */
export function localeFor(interaction: {
  locale?: string | null;
  guildLocale?: string | null;
}): string {
  const wanted =
    settings.source === "guild"
      ? (interaction.guildLocale ?? interaction.locale)
      : interaction.locale;
  return localeOf(wanted);
}

/** The closest catalog to `wanted`, or the fallback. */
export function localeOf(wanted: string | null | undefined): string {
  const available = catalogs();
  return matchLocale(wanted, new Set(available.keys()), settings.fallback);
}
