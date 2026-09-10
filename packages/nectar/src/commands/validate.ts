import type { Diagnostics } from "../compiler/diagnostics.js";
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
      "command.ts must export a `meta` object with at least a description.",
      { file },
    );
    return null;
  }
  if (!isRecord(value)) {
    fail(ctx, "invalid-meta", "`meta` must be an object.");
    return null;
  }

  let ok = true;
  const type = value.type ?? "chatInput";
  if (typeof type !== "string" || !COMMAND_TYPES.has(type)) {
    ok = fail(ctx, "invalid-meta", '`meta.type` must be "chatInput", "user", or "message".');
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
        "Context menu commands cannot have a description. Remove `meta.description`.",
      );
    }
    if (value.options !== undefined) {
      ok = fail(ctx, "invalid-meta", "Context menu commands cannot have options.");
    }
  }

  ok = checkLocalizations(ctx, value.nameLocalizations, "meta.nameLocalizations") && ok;
  ok =
    checkLocalizations(ctx, value.descriptionLocalizations, "meta.descriptionLocalizations") && ok;
  ok = checkTopLevel(ctx, value) && ok;

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
    diagnostics.error("missing-meta", "route.ts must export a `meta` object with a description.", {
      file,
    });
    return null;
  }
  if (!isRecord(value)) {
    fail(ctx, "invalid-meta", "`meta` must be an object.");
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

function fail(ctx: Ctx, code: string, message: string): false {
  ctx.diagnostics.error(code, message, { file: ctx.file });
  return false;
}

function checkName(ctx: Ctx, name: unknown, label: string, chatInput: boolean): boolean {
  if (typeof name !== "string" || name.length === 0 || name.length > 32) {
    return fail(ctx, "invalid-name", `${label} must be a string of 1 to 32 characters.`);
  }
  if (chatInput) {
    if (!COMMAND_NAME.test(name) || name !== name.toLowerCase()) {
      return fail(
        ctx,
        "invalid-name",
        `${label} "${name}" is not a valid chat input command name. Discord requires lowercase letters, digits, hyphens, and underscores.`,
      );
    }
  }
  return true;
}

function checkDescription(ctx: Ctx, description: unknown, label: string): boolean {
  if (typeof description !== "string" || description.length === 0 || description.length > 100) {
    return fail(ctx, "invalid-description", `${label} must be a string of 1 to 100 characters.`);
  }
  return true;
}

function checkLocalizations(ctx: Ctx, value: unknown, label: string): boolean {
  if (value === undefined) return true;
  if (!isRecord(value))
    return fail(ctx, "invalid-meta", `${label} must be an object of locale to string.`);
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text !== "string") {
      return fail(ctx, "invalid-meta", `${label}.${locale} must be a string.`);
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
      "`meta.defaultMemberPermissions` must be a permission bitfield (bigint, string, or number) or null.",
    );
  }
  if (value.nsfw !== undefined && typeof value.nsfw !== "boolean") {
    ok = fail(ctx, "invalid-meta", "`meta.nsfw` must be a boolean.");
  }
  ok = checkEnumArray(ctx, value.contexts, "meta.contexts", [0, 1, 2]) && ok;
  ok = checkEnumArray(ctx, value.integrationTypes, "meta.integrationTypes", [0, 1]) && ok;
  return ok;
}

function checkEnumArray(ctx: Ctx, value: unknown, label: string, allowed: number[]): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.some((v) => !allowed.includes(v))) {
    return fail(
      ctx,
      "invalid-meta",
      `${label} must be an array of ${allowed.join(", ")}. Use the discord.js enum values.`,
    );
  }
  return true;
}

function checkOptions(ctx: Ctx, options: unknown): boolean {
  if (!Array.isArray(options))
    return fail(ctx, "invalid-option", "`meta.options` must be an array.");
  if (options.length > 25) {
    return fail(ctx, "invalid-option", "A command can have at most 25 options.");
  }
  let ok = true;
  const names = new Set<string>();
  let seenOptional = false;
  for (const [index, option] of options.entries()) {
    const label = `meta.options[${index}]`;
    if (!isRecord(option)) {
      ok = fail(ctx, "invalid-option", `${label} must be an object.`);
      continue;
    }
    const typedOk = checkOption(ctx, option, label);
    ok = typedOk && ok;
    if (!typedOk) continue;
    const typed = option as unknown as CommandOption;
    if (names.has(typed.name)) {
      ok = fail(ctx, "invalid-option", `${label}: option name "${typed.name}" is used twice.`);
    }
    names.add(typed.name);
    if (typed.required) {
      if (seenOptional) {
        ok = fail(
          ctx,
          "invalid-option",
          `${label}: required option "${typed.name}" comes after an optional one. Discord requires all required options first.`,
        );
      }
    } else {
      seenOptional = true;
    }
  }
  return ok;
}

function checkOption(ctx: Ctx, option: Record<string, unknown>, label: string): boolean {
  let ok = true;
  if (typeof option.type !== "string" || !OPTION_TYPES.has(option.type)) {
    return fail(
      ctx,
      "invalid-option",
      `${label}.type must be one of ${[...OPTION_TYPES].map((t) => `"${t}"`).join(", ")}.`,
    );
  }
  ok = checkName(ctx, option.name, `${label}.name`, true) && ok;
  ok = checkDescription(ctx, option.description, `${label}.description`) && ok;
  if (option.required !== undefined && typeof option.required !== "boolean") {
    ok = fail(ctx, "invalid-option", `${label}.required must be a boolean.`);
  }
  ok = checkLocalizations(ctx, option.nameLocalizations, `${label}.nameLocalizations`) && ok;
  ok =
    checkLocalizations(ctx, option.descriptionLocalizations, `${label}.descriptionLocalizations`) &&
    ok;

  const type = option.type;
  const numeric = type === "integer" || type === "number";
  const choosable = type === "string" || numeric;

  for (const key of [
    "choices",
    "autocomplete",
    "minLength",
    "maxLength",
    "minValue",
    "maxValue",
    "channelTypes",
  ]) {
    if (option[key] === undefined) continue;
    const allowed =
      (key === "choices" || key === "autocomplete") && choosable
        ? true
        : (key === "minLength" || key === "maxLength") && type === "string"
          ? true
          : (key === "minValue" || key === "maxValue") && numeric
            ? true
            : key === "channelTypes" && type === "channel";
    if (!allowed) {
      ok = fail(ctx, "invalid-option", `${label}.${key} is not valid for a "${type}" option.`);
    }
  }

  if (option.autocomplete !== undefined && typeof option.autocomplete !== "boolean") {
    ok = fail(ctx, "invalid-option", `${label}.autocomplete must be a boolean.`);
  }
  if (option.choices !== undefined) {
    if (option.autocomplete === true) {
      ok = fail(ctx, "invalid-option", `${label} cannot have both choices and autocomplete.`);
    }
    ok = checkChoices(ctx, option.choices, `${label}.choices`, type === "string") && ok;
  }
  for (const key of ["minLength", "maxLength", "minValue", "maxValue"]) {
    const v = option[key];
    if (v !== undefined && typeof v !== "number") {
      ok = fail(ctx, "invalid-option", `${label}.${key} must be a number.`);
    }
  }
  if (typeof option.minLength === "number" && (option.minLength < 0 || option.minLength > 6000)) {
    ok = fail(ctx, "invalid-option", `${label}.minLength must be between 0 and 6000.`);
  }
  if (typeof option.maxLength === "number" && (option.maxLength < 1 || option.maxLength > 6000)) {
    ok = fail(ctx, "invalid-option", `${label}.maxLength must be between 1 and 6000.`);
  }
  if (option.channelTypes !== undefined) {
    if (
      !Array.isArray(option.channelTypes) ||
      option.channelTypes.some((c) => typeof c !== "number")
    ) {
      ok = fail(
        ctx,
        "invalid-option",
        `${label}.channelTypes must be an array of ChannelType values.`,
      );
    }
  }
  return ok;
}

function checkChoices(ctx: Ctx, choices: unknown, label: string, isString: boolean): boolean {
  if (!Array.isArray(choices)) return fail(ctx, "invalid-option", `${label} must be an array.`);
  if (choices.length > 25)
    return fail(ctx, "invalid-option", `${label} can have at most 25 entries.`);
  let ok = true;
  for (const [index, choice] of choices.entries()) {
    const at = `${label}[${index}]`;
    if (!isRecord(choice)) {
      ok = fail(ctx, "invalid-option", `${at} must be an object with name and value.`);
      continue;
    }
    const typed = choice as Partial<OptionChoice>;
    if (typeof typed.name !== "string" || typed.name.length === 0 || typed.name.length > 100) {
      ok = fail(ctx, "invalid-option", `${at}.name must be a string of 1 to 100 characters.`);
    }
    if (isString) {
      if (typeof typed.value !== "string" || typed.value.length === 0 || typed.value.length > 100) {
        ok = fail(ctx, "invalid-option", `${at}.value must be a string of 1 to 100 characters.`);
      }
    } else if (typeof typed.value !== "number") {
      ok = fail(ctx, "invalid-option", `${at}.value must be a number.`);
    }
    ok = checkLocalizations(ctx, typed.nameLocalizations, `${at}.nameLocalizations`) && ok;
  }
  return ok;
}
