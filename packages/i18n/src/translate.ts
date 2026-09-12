import { use } from "@nectar-js/nectar";
import type { Message, MessageValue, Vars } from "./format.js";
import { format } from "./format.js";
import type { MessageKey, VarsArg } from "./index.js";
import localeMiddleware from "./middleware.js";
import { catalogs, current, localeOf, warnOnce } from "./state.js";

/** Translates into a locale the caller picks. `t()` is this, bound to the reader's locale. */
export type Translate = <K extends MessageKey>(key: K, ...vars: VarsArg<K>) => string;

/**
 * Translates a message into the reader's locale.
 *
 * Works inside any command, component, or autocomplete handler, and inside middleware and
 * error boundaries below the i18n middleware. Event handlers don't run middleware, so use
 * `translator(locale)` there.
 */
export const t: Translate = (key, ...vars) => translate(locale(), key, vars[0]);

/** The locale the current reply is being written in. */
export function locale(): string {
  try {
    return use(localeMiddleware);
  } catch (cause) {
    throw new Error(
      "t() needs the i18n middleware, which the plugin adds to every command and component route. " +
        "Check that i18n() is in `plugins` and that the app has been rebuilt. Event handlers, " +
        "scheduled jobs, and anything outside a route have no reader: call translator(locale) there.",
      { cause },
    );
  }
}

/**
 * A `t` bound to one locale, for code that has no interaction: an event handler, a scheduled
 * job, a message you send to a whole server.
 *
 *     const t = translator(guild.preferredLocale);
 */
export function translator(wanted: string | null | undefined): Translate {
  const resolved = localeOf(wanted);
  return (key, ...vars) => translate(resolved, key, vars[0]);
}

/** Looks a key up in `locale`, then in the fallback locale, and fills in the variables. */
export function translate(locale: string, key: string, vars?: Vars): string {
  const message = lookup(locale, key);
  if (message === undefined) {
    warnOnce(key, `No message for "${key}" in any catalog. Replying with the key.`);
    return key;
  }
  return format(message, locale, vars);
}

function lookup(locale: string, key: string): Message | undefined {
  const all = catalogs();
  const found = all.get(locale)?.messages.get(key);
  if (found !== undefined) return found;
  const { fallback } = current();
  if (locale !== fallback) {
    const spare = all.get(fallback)?.messages.get(key);
    if (spare !== undefined) {
      warnOnce(
        `${locale}:${key}`,
        `${locale} has no message for "${key}". Replying in ${fallback}.`,
      );
      return spare;
    }
  }
  return undefined;
}

export type { MessageValue, Vars };
