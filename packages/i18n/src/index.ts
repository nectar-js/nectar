import type { MessageValue, Vars } from "./format.js";

/**
 * Filled in by the generated `.nectar/types.d.ts` through module augmentation. Until `nectar
 * build` has run, every key is accepted and no variables are required.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmentation target
export interface NectarMessages {}

type Declared<K extends string> = NectarMessages extends Record<K, infer V> ? V : never;
type Fallback<T, F> = [T] extends [never] ? F : T;

/** Every message in the fallback catalog, mapped to the variables it interpolates. */
export type Messages = Fallback<Declared<"messages">, Record<string, never>>;

export type MessageKey = keyof Messages & string;

type VarNames<K extends MessageKey> = K extends keyof Messages ? Messages[K] & string : never;

/** A message with variables needs them; one without takes no second argument. */
export type VarsArg<K extends MessageKey> = [VarNames<K>] extends [never]
  ? [vars?: Vars]
  : [vars: Record<VarNames<K>, MessageValue>];

export type { Catalog } from "./catalog.js";
export { CatalogError } from "./catalog.js";
export type { Coverage, LocaleCoverage } from "./coverage.js";
export { coverageOf } from "./coverage.js";
export type { Message, MessageValue, Vars } from "./format.js";
export { DISCORD_LOCALES, matchLocale } from "./locale.js";
export { localizations } from "./meta.js";
export { i18n } from "./plugin.js";
export type { I18nOptions } from "./state.js";
export type { Translate } from "./translate.js";
export { locale, t, translate, translator } from "./translate.js";
