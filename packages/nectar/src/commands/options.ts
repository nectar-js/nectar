import type { ChatInputCommandInteraction } from "discord.js";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import type { OptionType } from "./meta.js";

/** One option of a command handler, as registered with Discord. */
export interface OptionSpec {
  name: string;
  type: OptionType;
  required: boolean;
}

const OPTION_TYPE: Record<number, OptionType> = {
  [ApplicationCommandOptionType.String]: "string",
  [ApplicationCommandOptionType.Integer]: "integer",
  [ApplicationCommandOptionType.Number]: "number",
  [ApplicationCommandOptionType.Boolean]: "boolean",
  [ApplicationCommandOptionType.User]: "user",
  [ApplicationCommandOptionType.Channel]: "channel",
  [ApplicationCommandOptionType.Role]: "role",
  [ApplicationCommandOptionType.Mentionable]: "mentionable",
  [ApplicationCommandOptionType.Attachment]: "attachment",
};

interface PayloadNode {
  name?: string;
  type?: number;
  required?: boolean;
  options?: PayloadNode[];
}

/**
 * The options of one handler position (`""`, `"sub"`, or `"group/sub"`) of a registration
 * payload, in declaration order. Subcommands and groups are not options of the handler.
 */
export function optionsAt(payload: unknown, key: string): OptionSpec[] {
  let options = (payload as PayloadNode).options;
  for (const part of key === "" ? [] : key.split("/")) {
    options = options?.find((o) => o.name === part)?.options;
  }
  const out: OptionSpec[] = [];
  for (const option of options ?? []) {
    const type = option.type === undefined ? undefined : OPTION_TYPE[option.type];
    if (option.name !== undefined && type !== undefined) {
      out.push({ name: option.name, type, required: option.required === true });
    }
  }
  return out;
}

type Resolver = ChatInputCommandInteraction["options"];

const READ: Record<OptionType, (options: Resolver, name: string) => unknown> = {
  string: (o, n) => o.getString(n),
  integer: (o, n) => o.getInteger(n),
  number: (o, n) => o.getNumber(n),
  boolean: (o, n) => o.getBoolean(n),
  user: (o, n) => o.getUser(n),
  channel: (o, n) => o.getChannel(n),
  role: (o, n) => o.getRole(n),
  mentionable: (o, n) => o.getMentionable(n),
  attachment: (o, n) => o.getAttachment(n),
};

/**
 * Every option of the handler by name, read through discord.js's resolver. Options the user
 * left out are `null`, so the handler's options always have every declared key.
 */
export function resolveOptions(
  interaction: ChatInputCommandInteraction,
  specs: readonly OptionSpec[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { name, type } of specs) out[name] = READ[type](interaction.options, name);
  return out;
}
