import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isPluralForm, type Message } from "./format.js";

/** One locale's messages, keyed by their flattened dotted path. */
export interface Catalog {
  locale: string;
  messages: ReadonlyMap<string, Message>;
}

/** A catalog file is missing, unreadable, or not shaped like a catalog. */
export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

/**
 * Reads every `<locale>.json` in `dir`. The file name is the locale, so `fr.json` is French
 * and `pt-BR.json` is Brazilian Portuguese.
 *
 * Nested objects flatten to dotted keys: `{ "ban": { "done": "..." } }` is `ban.done`. An
 * object whose keys are all plural forms (`one`, `other`, an exact number) is one message with
 * plural forms rather than a group.
 */
export function loadCatalogs(dir: string): Map<string, Catalog> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new CatalogError(`No locale directory at ${dir}. Create it, or set \`dir\` on i18n().`);
  }
  const files = entries.filter((name) => name.endsWith(".json")).sort();
  if (files.length === 0) {
    throw new CatalogError(
      `${dir} has no .json catalogs. Add one named after its locale, like en-US.json.`,
    );
  }
  const catalogs = new Map<string, Catalog>();
  for (const file of files) {
    const locale = file.slice(0, -".json".length);
    catalogs.set(locale, { locale, messages: read(path.join(dir, file)) });
  }
  return catalogs;
}

function read(file: string): Map<string, Message> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new CatalogError(`${file} is not valid JSON: ${describe(error)}`);
  }
  if (!isRecord(parsed)) throw new CatalogError(`${file} must hold a JSON object.`);
  const messages = new Map<string, Message>();
  flatten(parsed, "", messages, file);
  if (messages.size === 0) throw new CatalogError(`${file} has no messages in it.`);
  return messages;
}

function flatten(
  value: Record<string, unknown>,
  prefix: string,
  out: Map<string, Message>,
  file: string,
): void {
  for (const [key, entry] of Object.entries(value)) {
    const full = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof entry === "string") {
      out.set(full, entry);
      continue;
    }
    if (!isRecord(entry)) {
      throw new CatalogError(
        `${file}: "${full}" is ${entry === null ? "null" : typeof entry}. A message is a string, and a group is an object.`,
      );
    }
    const keys = Object.keys(entry);
    if (keys.length > 0 && keys.every(isPluralForm)) {
      for (const [form, text] of Object.entries(entry)) {
        if (typeof text !== "string") {
          throw new CatalogError(`${file}: plural form "${full}.${form}" must be a string.`);
        }
      }
      out.set(full, entry as Record<string, string>);
      continue;
    }
    flatten(entry, full, out, file);
  }
}

/** The variables a message interpolates, so the generated types can require them. */
export function placeholdersOf(message: Message): string[] {
  const found = new Set<string>();
  if (typeof message !== "string") found.add("count");
  for (const text of typeof message === "string" ? [message] : Object.values(message)) {
    for (const match of strip(text).matchAll(/\{([\w.-]+)\}/g)) {
      const name = match[1];
      if (name !== undefined) found.add(name);
    }
  }
  return [...found].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `{{` and `}}` are literal braces, not a placeholder around `{`. */
function strip(text: string): string {
  return text.replace(/\{\{|\}\}/g, "");
}
