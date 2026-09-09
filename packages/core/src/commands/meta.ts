import type {
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  LocalizationMap,
} from "discord-api-types/v10";

export type CommandType = "chatInput" | "user" | "message";

export type OptionType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "user"
  | "channel"
  | "role"
  | "mentionable"
  | "attachment";

export interface OptionChoice<Value extends string | number = string | number> {
  name: string;
  value: Value;
  nameLocalizations?: LocalizationMap;
}

interface BaseOption {
  name: string;
  description: string;
  required?: boolean;
  nameLocalizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
}

export interface StringOption extends BaseOption {
  type: "string";
  choices?: OptionChoice<string>[];
  autocomplete?: boolean;
  minLength?: number;
  maxLength?: number;
}

export interface IntegerOption extends BaseOption {
  type: "integer";
  choices?: OptionChoice<number>[];
  autocomplete?: boolean;
  minValue?: number;
  maxValue?: number;
}

export interface NumberOption extends BaseOption {
  type: "number";
  choices?: OptionChoice<number>[];
  autocomplete?: boolean;
  minValue?: number;
  maxValue?: number;
}

export interface ChannelOption extends BaseOption {
  type: "channel";
  channelTypes?: ChannelType[];
}

export interface SimpleOption extends BaseOption {
  type: "boolean" | "user" | "role" | "mentionable" | "attachment";
}

export type CommandOption =
  | StringOption
  | IntegerOption
  | NumberOption
  | ChannelOption
  | SimpleOption;

/**
 * Registration settings that Discord only accepts on a top-level command.
 * For a command with subcommands these live in the parent directory's `route.ts`.
 */
export interface TopLevelMeta {
  defaultMemberPermissions?: bigint | string | number | null;
  nsfw?: boolean;
  contexts?: InteractionContextType[];
  integrationTypes?: ApplicationIntegrationType[];
}

/** `export const meta` in a `command.ts`. */
export interface CommandMeta extends TopLevelMeta {
  /** Overrides the name derived from the directory. */
  name?: string;
  /** Required for chat input commands and subcommands. Must be omitted for context menus. */
  description?: string;
  /** Defaults to `"chatInput"`. Context menu commands cannot be nested or have options. */
  type?: CommandType;
  options?: CommandOption[];
  nameLocalizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
}

/** `export const meta` in a `route.ts` under `commands/`. Describes a parent command or subcommand group. */
export interface CommandRouteMeta extends TopLevelMeta {
  name?: string;
  description: string;
  nameLocalizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
}
