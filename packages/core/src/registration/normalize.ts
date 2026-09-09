import type {
  APIApplicationCommand,
  APIApplicationCommandOption,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { ApplicationCommandType, ApplicationIntegrationType } from "discord-api-types/v10";

/**
 * A command reduced to the fields that decide whether Discord would consider it changed.
 *
 * Discord fills in defaults (`nsfw: false`, `integration_types: [0]`, `required: false`, empty
 * localization maps as `null`) and adds bookkeeping (`id`, `version`, `application_id`,
 * `dm_permission`) when it echoes a command back. Both sides pass through here so a no-op sync
 * produces an empty diff.
 */
export type NormalizedCommand = Record<string, unknown>;

export type AnyCommand = RESTPostAPIApplicationCommandsJSONBody | APIApplicationCommand;

/** `<type>:<name>`. Discord allows the same name across command types. */
export function commandKey(command: { type?: number | undefined; name: string }): string {
  return `${command.type ?? ApplicationCommandType.ChatInput}:${command.name}`;
}

export function normalizeCommand(command: AnyCommand): NormalizedCommand {
  const c = command as unknown as Record<string, unknown>;
  const type = (c.type as number | undefined) ?? ApplicationCommandType.ChatInput;
  return compact({
    type,
    name: c.name,
    name_localizations: localizations(c.name_localizations),
    description: type === ApplicationCommandType.ChatInput ? (c.description ?? "") : "",
    description_localizations: localizations(c.description_localizations),
    options: options(c.options),
    default_member_permissions:
      c.default_member_permissions == null ? undefined : String(c.default_member_permissions),
    nsfw: c.nsfw === true ? true : undefined,
    contexts: numbers(c.contexts),
    integration_types: numbers(c.integration_types) ?? [ApplicationIntegrationType.GuildInstall],
  });
}

function options(value: unknown): NormalizedCommand[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return (value as APIApplicationCommandOption[]).map((option) => {
    const o = option as unknown as Record<string, unknown>;
    return compact({
      type: o.type,
      name: o.name,
      name_localizations: localizations(o.name_localizations),
      description: o.description,
      description_localizations: localizations(o.description_localizations),
      required: o.required === true ? true : undefined,
      autocomplete: o.autocomplete === true ? true : undefined,
      choices: choices(o.choices),
      options: options(o.options),
      channel_types: numbers(o.channel_types),
      min_value: number(o.min_value),
      max_value: number(o.max_value),
      min_length: number(o.min_length),
      max_length: number(o.max_length),
    });
  });
}

function choices(value: unknown): NormalizedCommand[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.map((choice: Record<string, unknown>) =>
    compact({
      name: choice.name,
      value: choice.value,
      name_localizations: localizations(choice.name_localizations),
    }),
  );
}

function localizations(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  if (entries.length === 0) return undefined;
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

/** Sorted, deduplicated. Discord treats these as sets. */
function numbers(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

function number(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function compact(object: Record<string, unknown>): NormalizedCommand {
  const out: NormalizedCommand = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
