/** What a message can interpolate. Numbers and dates are formatted for the reader's locale. */
export type MessageValue = string | number | bigint | boolean | Date | null | undefined;

export type Vars = Record<string, MessageValue>;

/** One message: a single string, or the plural forms of one. */
export type Message = string | Readonly<Record<string, string>>;

/** The categories `Intl.PluralRules` can return. A message keyed only by these holds plurals. */
export const PLURAL_FORMS: ReadonlySet<string> = new Set([
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
]);

/** `"0"`, `"1"`: an exact count, which wins over the plural category. */
export function isPluralForm(key: string): boolean {
  return PLURAL_FORMS.has(key) || /^\d+$/.test(key);
}

/**
 * Picks the plural form for `count` and fills in the variables.
 *
 * `{name}` is replaced by `vars.name`; a variable that was not passed is left alone, so the
 * placeholder shows up in the reply instead of the word "undefined". `{{` and `}}` are literal
 * braces.
 */
export function format(message: Message, locale: string, vars: Vars = {}): string {
  return interpolate(
    typeof message === "string" ? message : select(message, locale, vars),
    locale,
    vars,
  );
}

function select(forms: Readonly<Record<string, string>>, locale: string, vars: Vars): string {
  const count = Number(vars.count);
  if (Number.isFinite(count)) {
    const exact = forms[String(count)];
    if (exact !== undefined) return exact;
    const category = plurals(locale).select(count);
    const form = forms[category];
    if (form !== undefined) return form;
  }
  return forms.other ?? Object.values(forms)[0] ?? "";
}

const PLACEHOLDER = /\{\{|\}\}|\{([\w.-]+)\}/g;

function interpolate(text: string, locale: string, vars: Vars): string {
  if (!text.includes("{") && !text.includes("}")) return text;
  return text.replace(PLACEHOLDER, (match, name: string | undefined) => {
    if (name === undefined) return match === "{{" ? "{" : "}";
    if (!Object.hasOwn(vars, name)) return match;
    return render(vars[name], locale);
  });
}

function render(value: MessageValue, locale: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "bigint") {
    return numbers(locale).format(value);
  }
  if (value instanceof Date) return dates(locale).format(value);
  return String(value);
}

// Building an Intl formatter costs more than using one, and a bot answers the same few locales
// over and over.
const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function plurals(locale: string): Intl.PluralRules {
  return cached(pluralRules, locale, () => new Intl.PluralRules(locale));
}

function numbers(locale: string): Intl.NumberFormat {
  return cached(numberFormats, locale, () => new Intl.NumberFormat(locale));
}

function dates(locale: string): Intl.DateTimeFormat {
  return cached(dateFormats, locale, () => new Intl.DateTimeFormat(locale, { dateStyle: "long" }));
}

function cached<T>(store: Map<string, T>, locale: string, build: () => T): T {
  let found = store.get(locale);
  if (found === undefined) {
    found = build();
    store.set(locale, found);
  }
  return found;
}
