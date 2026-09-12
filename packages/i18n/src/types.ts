import { type Catalog, placeholdersOf } from "./catalog.js";

/**
 * The module augmentation `nectar build` appends to `.nectar/types.d.ts`, so `t()` only accepts
 * keys the fallback catalog has and asks for the variables each message interpolates.
 */
export function messageTypes(catalogs: ReadonlyMap<string, Catalog>, fallback: string): string {
  const base = catalogs.get(fallback);
  if (base === undefined) return "";
  const lines = [...base.messages]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, message]) => {
      const names = placeholdersOf(message);
      const vars = names.length === 0 ? "never" : names.map(quote).join(" | ");
      return `      ${quote(key)}: ${vars};`;
    });
  return [
    'declare module "@nectar-js/i18n" {',
    "  interface NectarMessages {",
    "    messages: {",
    ...lines,
    "    };",
    "  }",
    "}",
  ].join("\n");
}

function quote(value: string): string {
  return JSON.stringify(value);
}
