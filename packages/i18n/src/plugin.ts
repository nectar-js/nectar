import { existsSync, type FSWatcher, watch } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { definePlugin, type Logger, type NectarPlugin, type PluginChange } from "@nectar-js/nectar";
import type { Catalog } from "./catalog.js";
import { CatalogError } from "./catalog.js";
import { type Coverage, count, coverageOf, listKeys } from "./coverage.js";
import {
  catalogs,
  configure,
  current,
  type I18nOptions,
  reload,
  setLogger,
  takeMissingMeta,
} from "./state.js";
import { messageTypes } from "./types.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

/**
 * Adds translations to a Nectar app.
 *
 *     import { i18n } from "@nectar-js/i18n";
 *
 *     export default defineConfig({
 *       intents: ["Guilds"],
 *       plugins: [i18n()],
 *     });
 *
 * It reads `locales/<locale>.json`, gives every command and component route the middleware
 * `t()` reads the locale from, generates the message key types, and reports at build time when
 * a locale has fallen behind.
 */
export function i18n(options: I18nOptions = {}): NectarPlugin {
  configure(options);
  let watcher: FSWatcher | null = null;

  return definePlugin({
    name: "i18n",
    version,

    transform(graph) {
      const { fallback, missing } = current();
      let all: ReadonlyMap<string, Catalog>;
      try {
        all = reload();
      } catch (error) {
        return [problem(error)];
      }
      if (!all.has(fallback)) {
        return [
          {
            type: "diagnostic",
            severity: "error",
            code: "i18n-no-fallback",
            message: `No catalog for the fallback locale "${fallback}". Add ${fallback}.json, or set \`fallback\` on i18n().`,
          },
        ];
      }

      const changes: PluginChange[] = [];
      const coverage = coverageOf(all, fallback);
      for (const locale of coverage.locales) {
        if (!locale.known) {
          changes.push({
            type: "diagnostic",
            severity: "warning",
            code: "i18n-unknown-locale",
            message: `Discord has no locale "${locale.locale}". Its messages still work, but localizations() leaves it out of command metadata.`,
          });
        }
        if (locale.missing.length > 0 && missing !== "off") {
          changes.push({
            type: "diagnostic",
            severity: missing === "error" ? "error" : "warning",
            code: "i18n-missing-key",
            message: `${locale.locale} is missing ${locale.missing.length} of ${count(coverage.total, "message")}: ${listKeys(locale.missing)}. Readers get ${fallback} instead.`,
          });
        }
        if (locale.extra.length > 0) {
          changes.push({
            type: "diagnostic",
            severity: "warning",
            code: "i18n-unused-key",
            message: `${locale.locale} has ${count(locale.extra.length, "message")} ${fallback} does not: ${listKeys(locale.extra)}. Nothing can reach ${locale.extra.length === 1 ? "it" : "them"}.`,
          });
        }
      }

      // Handler modules were imported to read their `meta`, so a localizations() call that found
      // nothing has already registered itself.
      for (const key of takeMissingMeta()) {
        changes.push({
          type: "diagnostic",
          severity: "error",
          code: "i18n-unknown-key",
          message: `localizations("${key}") found no message with that key in any catalog.`,
        });
      }

      for (const route of graph.routes) {
        if (route.kind === "event") continue;
        changes.push({ type: "middleware", route: route.id, kind: route.kind, file: MIDDLEWARE });
      }
      return changes;
    },

    types() {
      try {
        return messageTypes(catalogs(), current().fallback);
      } catch {
        // transform reported it already, and failing here would bury that message.
        return "";
      }
    },

    commands: [
      {
        name: "i18n",
        description: "Show how much of each locale is translated.",
        options: {
          strict: { type: "boolean", description: "Exit 1 when a locale is incomplete." },
        },
        run({ flags, out, err }) {
          const { dir, fallback } = current();
          let coverage: Coverage;
          try {
            coverage = coverageOf(reload(), fallback);
          } catch (error) {
            err(describe(error));
            return 1;
          }
          out(dir);
          out(`${coverage.total} messages in ${fallback}`);
          out("");
          const width = Math.max(...coverage.locales.map((l) => l.locale.length));
          const digits = String(coverage.total).length;
          let incomplete = 0;
          for (const locale of coverage.locales) {
            const notes: string[] = [];
            if (locale.missing.length > 0) notes.push(`missing ${listKeys(locale.missing, 3)}`);
            if (locale.extra.length > 0) notes.push(`unused ${listKeys(locale.extra, 3)}`);
            if (!locale.known) notes.push("not a Discord locale");
            if (notes.length > 0) incomplete += 1;
            const have = String(coverage.total - locale.missing.length).padStart(digits);
            const tail = notes.length === 0 ? "" : `  ${notes.join("; ")}`;
            out(`  ${locale.locale.padEnd(width)}  ${have}/${coverage.total}${tail}`);
          }
          return flags.strict === true && incomplete > 0 ? 1 : 0;
        },
      },
    ],

    start(app) {
      setLogger(app.logger);
      const { dir, fallback } = current();
      // Reading them now turns a broken catalog into a failed startup instead of a failed reply.
      const all = catalogs();
      app.logger.info(`Loaded ${all.size} locales from ${dir}, falling back to ${fallback}.`, {
        plugin: "i18n",
      });
      if (app.env === "development") watcher = watchCatalogs(dir, app.logger);
    },

    stop() {
      watcher?.close();
      watcher = null;
      setLogger(null);
    },
  });
}

/**
 * `nectar dev` recompiles when a route file changes, and a catalog is not a route file. Watching
 * the directory here is what makes an edited translation show up in the next reply.
 */
function watchCatalogs(dir: string, logger: Logger): FSWatcher | null {
  let timer: NodeJS.Timeout | null = null;
  try {
    return watch(dir, (_event, file) => {
      if (file === null || !file.toString().endsWith(".json")) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          logger.info(`Reloaded ${reload().size} locales.`, { plugin: "i18n" });
        } catch (error) {
          logger.warn(`Could not reload locales: ${describe(error)}`, { plugin: "i18n" });
        }
      }, 80);
    });
  } catch {
    // Reloading is a convenience. A platform that refuses to watch is not worth failing over.
    return null;
  }
}

/** Where Nectar finds the middleware: the built file, or the source when running from `src`. */
const MIDDLEWARE = ((): string => {
  const built = path.join(import.meta.dirname, "middleware.js");
  return existsSync(built) ? built : path.join(import.meta.dirname, "middleware.ts");
})();

function problem(error: unknown): PluginChange {
  return {
    type: "diagnostic",
    severity: "error",
    code: error instanceof CatalogError ? "i18n-catalog" : "i18n-failed",
    message: describe(error),
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
