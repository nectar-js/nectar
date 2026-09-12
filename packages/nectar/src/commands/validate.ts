import { type DiagnosticCode, type Diagnostics, typeOf } from "../compiler/diagnostics.js";
import type { CommandMeta, CommandOption, CommandRouteMeta, OptionChoice } from "./meta.js";

export const COMMAND_NAME = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

const OPTION_TYPES = new Set([
  "string",
  "integer",
  "number",
  "boolean",
  "user",
  "channel",
  "role",
  "mentionable",
  "attachment",
]);

const COMMAND_TYPES = new Set(["chatInput", "user", "message"]);

const TOP_LEVEL_KEYS = [
  "defaultMemberPermissions",
  "nsfw",
  "contexts",
  "integrationTypes",
] as const;

interface Ctx {
  diagnostics: Diagnostics;
  file: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates the `meta` export of a `command.ts`. Returns null after reporting when unusable. */
export function validateCommandMeta(
  value: unknown,
  file: string,
  diagnostics: Diagnostics,
): CommandMeta | null {
  const ctx = { diagnostics, file };
  if (value === undefined) {
    diagnostics.error(
      "missing-meta",
      'This command.ts doesn\'t export meta. Discord needs a description for every slash command, so add export const meta = { description: "..." }. A context menu command sets type instead, like { type: "user" }.',
      { file },
    );
    return null;
  }
  if (!isRecord(value)) {
    fail(
      ctx,
      "invalid-meta",
      `meta is ${typeOf(value)}. Export an object, like { description: "..." }.`,
    );
    return null;
  }

  let ok = true;
  const type = value.type ?? "chatInput";
  if (typeof type !== "string" || !COMMAND_TYPES.has(type)) {
    ok = fail(
      ctx,
      "invalid-meta",
      `meta.type is ${JSON.stringify(type)}. Use "chatInput" for a slash command, or "user" or "message" for a context menu command.`,
    );
  }

  if (value.name !== undefined)
    ok = checkName(ctx, value.name, "meta.name", type === "chatInput") && ok;

  if (type === "chatInput") {
    ok = checkDescription(ctx, value.description, "meta.description") && ok;
    if (value.options !== undefined) ok = checkOptions(ctx, value.options) && ok;
  } else {
    if (value.description !== undefined && value.description !== "") {
      ok = fail(
        ctx,
        "invalid-meta",
        "Discord doesn't allow a description on context menu commands. Remove meta.description.",
      );
    }
    if (value.options !== undefined) {
      ok = fail(
        ctx,
        "invalid-meta",
        "Discord doesn't allow options on context menu commands. Remove meta.options.",
      );
    }
  }

  ok = checkLocalizations(ctx, value.nameLocalizations, "meta.nameLocalizations") && ok;
  ok =
    checkLocalizations(ctx, value.descriptionLocalizations, "meta.descriptionLocalizations") && ok;
  ok = checkTopLevel(ctx, value) && ok;
  if (
    value.defer !== undefined &&
    typeof value.defer !== "boolean" &&
    value.defer !== "ephemeral"
  ) {
    ok = fail(
      ctx,
      "invalid-meta",
      `meta.defer is ${JSON.stringify(value.defer)}. Use true to defer the reply before the handler runs, or "ephemeral" to defer it as an ephemeral reply.`,
    );
  }

  return ok ? (value as unknown as CommandMeta) : null;
}

/** Validates the `meta` export of a `route.ts` under `commands/`. */
export function validateCommandRouteMeta(
  value: unknown,
  file: string,
  diagnostics: Diagnostics,
): CommandRouteMeta | null {
  const ctx = { diagnostics, file };
  if (value === undefined) {
    diagnostics.error(
      "missing-meta",
      'This route.ts doesn\'t export meta. It holds the description Discord shows for the command or subcommand group, so add export const meta = { description: "..." }.',
      { file },
    );
    return null;
  }
  if (!isRecord(value)) {
    fail(
      ctx,
      "invalid-meta",
      `meta is ${typeOf(value)}. Export an object, like { description: "..." }.`,
    );
    return null;
  }
  let ok = checkDescription(ctx, value.description, "meta.description");
  if (value.name !== undefined) ok = checkName(ctx, value.name, "meta.name", true) && ok;
  ok = checkLocalizations(ctx, value.nameLocalizations, "meta.nameLocalizations") && ok;
  ok =
    checkLocalizations(ctx, value.descriptionLocalizations, "meta.descriptionLocalizations") && ok;
  ok = checkTopLevel(ctx, value) && ok;
  return ok ? (value as unknown as CommandRouteMeta) : null;
}

/** Reports any top-level-only field so callers can reject them on nested commands. */
export function topLevelKeysUsed(meta: object): string[] {
  return TOP_LEVEL_KEYS.filter(
    (key) => key in meta && (meta as Record<string, unknown>)[key] !== undefined,
  );
}

function fail(ctx: Ctx, code: DiagnosticCode, message: string): false {
  ctx.diagnostics.error(code, message, { file: ctx.file });
  return false;
}

/** What a text field holds, for length errors: `empty`, `140 characters`, or its type. */
function sizeOf(value: unknown): string {
  if (typeof value !== "string") return typeOf(value);
  return value === "" ? "empty" : `${value.length} characters`;
}

function checkName(ctx: Ctx, name: unknown, label: string, chatInput: boolean): boolean {
  if (typeof name !== "string" || name.length === 0 || name.length > 32) {
    return fail(
      ctx,
      "invalid-name",
      `${label} is ${sizeOf(name)}. Discord needs a name of 1 to 32 characters.`,
    );
  }
  if (chatInput) {
    if (!COMMAND_NAME.test(name) || name !== name.toLowerCase()) {
      return fail(
        ctx,
        "invalid-name",
        `${label} is "${name}". Discord only allows lowercase letters, digits, hyphens, and underscores in slash command and option names.`,
      );
    }
  }
  return true;
}

function checkDescription(ctx: Ctx, description: unknown, label: string): boolean {
  if (typeof description !== "string" || description.length === 0 || description.length > 100) {
    return fail(
      ctx,
      "invalid-description",
      `${label} is ${sizeOf(description)}. Discord needs a description of 1 to 100 characters.`,
    );
  }
  return true;
}

function checkLocalizations(ctx: Ctx, value: unknown, label: string): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) {
    return fail(
      ctx,
      "invalid-meta",
      `${label} is ${typeOf(value)}. Use an object of locale to text, like { fr: "..." }.`,
    );
  }
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text !== "string") {
      return fail(ctx, "invalid-meta", `${label}.${locale} is ${typeOf(text)}, not a string.`);
    }
  }
  return true;
}

function checkTopLevel(ctx: Ctx, value: Record<string, unknown>): boolean {
  let ok = true;
  const perms = value.defaultMemberPermissions;
  if (
    perms !== undefined &&
    perms !== null &&
    typeof perms !== "bigint" &&
    typeof perms !== "string" &&
    typeof perms !== "number"
  ) {
    ok = fail(
      ctx,
      "invalid-meta",
      `meta.defaultMemberPermissions is ${typeOf(perms)}. Use a permission bitfield, like PermissionFlagsBits.BanMembers from discord.js, or null.`,
    );
  }
  if (value.nsfw !== undefined && typeof value.nsfw !== "boolean") {
    ok = fail(ctx, "invalid-meta", `meta.nsfw is ${typeOf(value.nsfw)}. Use true or false.`);
  }
  ok =
    checkEnumArray(ctx, value.contexts, "meta.contexts", "InteractionContextType", [0, 1, 2]) && ok;
  ok =
    checkEnumArray(
      ctx,
      value.integrationTypes,
      "meta.integrationTypes",
      "ApplicationIntegrationType",
      [0, 1],
    ) && ok;
  return ok;
}

function checkEnumArray(
  ctx: Ctx,
  value: unknown,
  label: string,
  enumName: string,
  allowed: number[],
): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.some((v) => !allowed.includes(v))) {
    return fail(
      ctx,
      "invalid-meta",
      `${label} has to be an array of ${enumName} values from discord.js.`,
    );
  }
  return true;
}

function checkOptions(ctx: Ctx, options: unknown): boolean {
  if (!Array.isArray(options)) {
    return fail(ctx, "invalid-option", `meta.options is ${typeOf(options)}, not an array.`);
  }
  if (options.length > 25) {
    return fail(
      ctx,
      "invalid-option",
      `meta.options has ${options.length} options. Discord allows 25 per command.`,
    );
  }
  let ok = true;
  const names = new Set<string>();
  let seenOptional = false;
  for (const [index, option] of options.entries()) {
    const label = `meta.options[${index}]`;
    if (!isRecord(option)) {
      ok = fail(ctx, "invalid-option", `${label} is ${typeOf(option)}, not an object.`);
      continue;
    }
    const typedOk = checkOption(ctx, option, label);
    ok = typedOk && ok;
    if (!typedOk) continue;
    const typed = option as unknown as CommandOption;
    if (names.has(typed.name)) {
      ok = fail(
        ctx,
        "invalid-option",
        `${label} reuses the name "${typed.name}". Discord needs option names to be unique within a command.`,
      );
    }
    names.add(typed.name);
    if (typed.required) {
      if (seenOptional) {
        ok = fail(
          ctx,
          "invalid-option",
          `${label}, "${typed.name}", is required but comes after an optional option. Discord needs required options first, so move it up.`,
        );
      }
    } else {
      seenOptional = true;
    }
  }
  return ok;
}

/** The option types each type-specific field works on. */
const FIELD_TYPES: Record<string, readonly string[]> = {
  choices: ["string", "integer", "number"],
  autocomplete: ["string", "integer", "number"],
  minLength: ["string"],
  maxLength: ["string"],
  minValue: ["integer", "number"],
  maxValue: ["integer", "number"],
  channelTypes: ["channel"],
};

const quoted = (items: Iterable<string>, type: "conjunction" | "disjunction") =>
  new Intl.ListFormat("en", { type }).format([...items].map((item) => `"${item}"`));

function checkOption(ctx: Ctx, option: Record<string, unknown>, label: string): boolean {
  let ok = true;
  if (typeof option.type !== "string" || !OPTION_TYPES.has(option.type)) {
    return fail(
      ctx,
      "invalid-option",
      `${label}.type is ${option.type === undefined ? "missing" : JSON.stringify(option.type)}. Use ${quoted(OPTION_TYPES, "disjunction")}.`,
    );
  }
  ok = checkName(ctx, option.name, `${label}.name`, true) && ok;
  ok = checkDescription(ctx, option.description, `${label}.description`) && ok;
  if (option.required !== undefined && typeof option.required !== "boolean") {
    ok = fail(
      ctx,
      "invalid-option",
      `${label}.required is ${typeOf(option.required)}. Use true or false.`,
    );
  }
  ok = checkLocalizations(ctx, option.nameLocalizations, `${label}.nameLocalizations`) && ok;
  ok =
    checkLocalizations(ctx, option.descriptionLocalizations, `${label}.descriptionLocalizations`) &&
    ok;

  const type = option.type;
  for (const [key, types] of Object.entries(FIELD_TYPES)) {
    if (option[key] === undefined || types.includes(type)) continue;
    ok = fail(
      ctx,
      "invalid-option",
      `${label}.${key} only works on ${quoted(types, "conjunction")} options, and this one is "${type}".`,
    );
  }

  if (option.autocomplete !== undefined && typeof option.autocomplete !== "boolean") {
    ok = fail(
      ctx,
      "invalid-option",
      `${label}.autocomplete is ${typeOf(option.autocomplete)}. Use true or false.`,
    );
  }
  if (option.choices !== undefined) {
    if (option.autocomplete === true) {
      ok = fail(
        ctx,
        "invalid-option",
        `${label} has both choices and autocomplete. Discord allows one or the other.`,
      );
    }
    ok = checkChoices(ctx, option.choices, `${label}.choices`, type === "string") && ok;
  }
  for (const key of ["minLength", "maxLength", "minValue", "maxValue"]) {
    const v = option[key];
    if (v !== undefined && typeof v !== "number") {
      ok = fail(ctx, "invalid-option", `${label}.${key} is ${typeOf(v)}, not a number.`);
    }
  }
  if (typeof option.minLength === "number" && (option.minLength < 0 || option.minLength > 6000)) {
    ok = fail(
      ctx,
      "invalid-option",
      `${label}.minLength is ${option.minLength}. Discord allows 0 to 6000.`,
    );
  }
  if (typeof option.maxLength === "number" && (option.maxLength < 1 || option.maxLength > 6000)) {
    ok = fail(
      ctx,
      "invalid-option",
      `${label}.maxLength is ${option.maxLength}. Discord allows 1 to 6000.`,
    );
  }
  if (option.channelTypes !== undefined) {
    if (
      !Array.isArray(option.channelTypes) ||
      option.channelTypes.some((c) => typeof c !== "number")
    ) {
      ok = fail(
        ctx,
        "invalid-option",
        `${label}.channelTypes has to be an array of ChannelType values from discord.js.`,
      );
    }
  }
  return ok;
}

function checkChoices(ctx: Ctx, choices: unknown, label: string, isString: boolean): boolean {
  if (!Array.isArray(choices)) {
    return fail(ctx, "invalid-option", `${label} is ${typeOf(choices)}, not an array.`);
  }
  if (choices.length > 25) {
    return fail(
      ctx,
      "invalid-option",
      `${label} has ${choices.length} entries. Discord allows 25 per option.`,
    );
  }
  let ok = true;
  for (const [index, choice] of choices.entries()) {
    const at = `${label}[${index}]`;
    if (!isRecord(choice)) {
      ok = fail(
        ctx,
        "invalid-option",
        `${at} is ${typeOf(choice)}. Each choice is an object like { name: "Red", value: "red" }.`,
      );
      continue;
    }
    const typed = choice as Partial<OptionChoice>;
    if (typeof typed.name !== "string" || typed.name.length === 0 || typed.name.length > 100) {
      ok = fail(
        ctx,
        "invalid-option",
        `${at}.name is ${sizeOf(typed.name)}. Discord needs a name of 1 to 100 characters.`,
      );
    }
    if (isString) {
      if (typeof typed.value !== "string" || typed.value.length === 0 || typed.value.length > 100) {
        ok = fail(
          ctx,
          "invalid-option",
          `${at}.value is ${sizeOf(typed.value)}. A string option's choices need a value of 1 to 100 characters.`,
        );
      }
    } else if (typeof typed.value !== "number") {
      ok = fail(
        ctx,
        "invalid-option",
        `${at}.value is ${typeOf(typed.value)}. A numeric option's choices need a number value.`,
      );
    }
    ok = checkLocalizations(ctx, typed.nameLocalizations, `${at}.nameLocalizations`) && ok;
  }
  return ok;
}
