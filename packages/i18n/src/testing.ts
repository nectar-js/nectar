import { configure, type I18nOptions } from "./state.js";

/**
 * Points the translator at a catalog directory.
 *
 * `createTestApp()` reads the manifest, not `nectar.config.ts`, so `i18n()` never runs in a
 * test and nothing knows where the catalogs are. Call this once at the top of the file:
 *
 *     useLocales(new URL("../locales", import.meta.url));
 *
 * Pass the reader's locale per interaction, the way Discord would:
 *
 *     await app.command("ban", { target }, { locale: "fr" });
 */
export function useLocales(dir: string | URL, options: Omit<I18nOptions, "dir"> = {}): void {
  configure({ ...options, dir });
}
