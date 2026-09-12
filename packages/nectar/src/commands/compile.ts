import path from "node:path";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { Diagnostics } from "../compiler/diagnostics.js";
import { loadModule } from "../compiler/load.js";
import type { Boundary, Route, RouteTable } from "../compiler/routes.js";
import { formatSegment } from "../compiler/segments.js";
import { checkHandler } from "../components/compile.js";
import type {
  CommandMeta,
  CommandOption,
  CommandRouteMeta,
  DeferMode,
  TopLevelMeta,
} from "./meta.js";
import { topLevelKeysUsed, validateCommandMeta, validateCommandRouteMeta } from "./validate.js";

export interface CompiledCommand {
  name: string;
  type: ApplicationCommandType;
  /**
   * Handler routes keyed by their position inside the command, using the registered names:
   * `""` for a plain command, `"ban"` for a subcommand, `"group/sub"` inside a subcommand group.
   */
  handlers: Record<string, Route>;
  /** How each handler position defers, for the ones whose `meta.defer` asks for it. */
  defer: Record<string, DeferMode>;
  payload: RESTPostAPIApplicationCommandsJSONBody;
  /** Every file that contributed to this command. */
  files: string[];
}

export interface CompiledCommands {
  commands: CompiledCommand[];
  diagnostics: Diagnostics;
}

const OPTION_TYPE: Record<CommandOption["type"], ApplicationCommandOptionType> = {
  string: ApplicationCommandOptionType.String,
  integer: ApplicationCommandOptionType.Integer,
  number: ApplicationCommandOptionType.Number,
  boolean: ApplicationCommandOptionType.Boolean,
  user: ApplicationCommandOptionType.User,
  channel: ApplicationCommandOptionType.Channel,
  role: ApplicationCommandOptionType.Role,
  mentionable: ApplicationCommandOptionType.Mentionable,
  attachment: ApplicationCommandOptionType.Attachment,
};

const COMMAND_TYPE = {
  chatInput: ApplicationCommandType.ChatInput,
  user: ApplicationCommandType.User,
  message: ApplicationCommandType.Message,
} as const;

const TYPE_LABEL: Record<number, string> = {
  [ApplicationCommandType.ChatInput]: "slash command",
  [ApplicationCommandType.User]: "user context menu command",
  [ApplicationCommandType.Message]: "message context menu command",
};

/** How many commands of each type Discord takes, globally and in each server. */
const COMMAND_LIMITS: Record<number, number> = {
  [ApplicationCommandType.ChatInput]: 100,
  [ApplicationCommandType.User]: 15,
  [ApplicationCommandType.Message]: 15,
};

interface LoadedRoute {
  route: Route;
  parts: string[];
  meta: CommandMeta;
}

interface LoadedRouteMeta {
  boundary: Boundary;
  meta: CommandRouteMeta;
  used: boolean;
}

/** Compiles the command routes of a route table into Discord command definitions. */
export async function compileCommands(table: RouteTable): Promise<CompiledCommands> {
  const diagnostics = new Diagnostics();
  const commands: CompiledCommand[] = [];

  const [loaded, routeMetas] = await Promise.all([
    loadRoutes(table.routes, diagnostics),
    loadRouteMetas(table.boundaries, diagnostics),
  ]);

  const byTopLevel = new Map<string, LoadedRoute[]>();
  for (const entry of loaded) {
    const top = entry.parts[0] as string;
    byTopLevel.set(top, [...(byTopLevel.get(top) ?? []), entry]);
  }

  for (const [top, entries] of [...byTopLevel].sort(([a], [b]) => a.localeCompare(b))) {
    const command = compileTopLevel(top, entries, routeMetas, diagnostics);
    if (command !== null) commands.push(command);
  }

  for (const entry of routeMetas.values()) {
    if (!entry.used) {
      diagnostics.warn(
        "unused-route-meta",
        "This route.ts has no effect because there are no subcommands below it. A plain command's meta goes in its command.ts.",
        { file: entry.boundary.file },
      );
    }
  }

  detectDuplicateNames(commands, diagnostics);
  checkLimits(commands, diagnostics);
  commands.sort((a, b) => a.type - b.type || a.name.localeCompare(b.name));
  return { commands, diagnostics };
}

function checkLimits(commands: CompiledCommand[], diagnostics: Diagnostics): void {
  for (const [type, limit] of Object.entries(COMMAND_LIMITS)) {
    const ofType = commands.filter((c) => c.type === Number(type));
    const first = ofType[0];
    if (first === undefined || ofType.length <= limit) continue;
    const slash = Number(type) === ApplicationCommandType.ChatInput;
    diagnostics.error(
      "too-many-commands",
      `The app has ${ofType.length} ${TYPE_LABEL[Number(type)]}s, and Discord allows ${limit}, globally and in each server. ${slash ? "Subcommands don't count toward it, so group related commands under one." : "Remove some."}`,
      { file: commandsDir(first) },
    );
  }
}

/** The `commands/` directory, found by walking up from one of the command's handlers. */
function commandsDir(command: CompiledCommand): string {
  const route = Object.values(command.handlers)[0] as Route;
  let dir = path.dirname(route.file);
  for (let i = 0; i < route.segments.length; i++) dir = path.dirname(dir);
  return dir;
}

async function loadRoutes(routes: Route[], diagnostics: Diagnostics): Promise<LoadedRoute[]> {
  const commandRoutes = routes.filter((r) => r.kind === "command");
  const results = await Promise.all(
    commandRoutes.map(async (route): Promise<LoadedRoute | null> => {
      const module = await importOrReport(route.file, diagnostics);
      if (module === null) return null;
      if (!checkHandler(module, route, diagnostics)) return null;
      const meta = validateCommandMeta(module.meta, route.file, diagnostics);
      if (meta === null) return null;
      return { route, parts: route.path.split("/"), meta };
    }),
  );
  return results.filter((r): r is LoadedRoute => r !== null);
}

async function loadRouteMetas(
  boundaries: Boundary[],
  diagnostics: Diagnostics,
): Promise<Map<string, LoadedRouteMeta>> {
  const map = new Map<string, LoadedRouteMeta>();
  const relevant = boundaries.filter((b) => b.kind === "route" && b.category === "command");
  await Promise.all(
    relevant.map(async (boundary) => {
      const key = boundary.segments
        .filter((s) => s.type !== "group")
        .map(formatSegment)
        .join("/");
      if (key === "") {
        diagnostics.error(
          "route-meta-without-path",
          "This route.ts isn't inside a command's directory, so it doesn't describe a command. Move it into the command's directory, like commands/moderation/route.ts.",
          { file: boundary.file },
        );
        return;
      }
      const module = await importOrReport(boundary.file, diagnostics);
      if (module === null) return;
      const meta = validateCommandRouteMeta(module.meta, boundary.file, diagnostics);
      if (meta === null) return;
      map.set(key, { boundary, meta, used: false });
    }),
  );
  return map;
}

async function importOrReport(
  file: string,
  diagnostics: Diagnostics,
): Promise<Record<string, unknown> | null> {
  try {
    return await loadModule(file);
  } catch (error) {
    diagnostics.error(
      "module-load-failed",
      `The compiler imports every route file to read its exports, and this one threw: ${error instanceof Error ? error.message : String(error)}`,
      { file },
    );
    return null;
  }
}

function compileTopLevel(
  top: string,
  entries: LoadedRoute[],
  routeMetas: Map<string, LoadedRouteMeta>,
  diagnostics: Diagnostics,
): CompiledCommand | null {
  const direct = entries.filter((e) => e.parts.length === 1);
  const nested = entries.filter((e) => e.parts.length > 1);

  // Two command.ts files for one command, like ping/ and (group)/ping/. The route table
  // already reported them as a duplicate route.
  if (direct.length > 1) return null;

  if (direct.length > 0 && nested.length > 0) {
    for (const entry of nested) {
      diagnostics.error(
        "mixed-command-and-subcommands",
        `"${top}" has a command.ts and also subcommands, like this one. Discord doesn't let a command with subcommands run by itself. Replace ${relative(direct[0]?.route.file)} with a route.ts, or move this file out of ${top}/.`,
        { file: entry.route.file, route: entry.route.id },
      );
    }
    return null;
  }

  const tooDeep = nested.filter((e) => e.parts.length > 3);
  if (tooDeep.length > 0) {
    for (const entry of tooDeep) {
      diagnostics.error(
        "command-too-deep",
        `"${entry.route.path}" is ${entry.parts.length} levels deep. Discord commands go three levels at most: command, subcommand group, and subcommand. Remove a level of directories.`,
        { file: entry.route.file, route: entry.route.id },
      );
    }
    return null;
  }

  if (direct.length === 1) return compilePlainCommand(direct[0] as LoadedRoute, diagnostics);

  return compileParentCommand(top, nested, routeMetas, diagnostics);
}

function compilePlainCommand(entry: LoadedRoute, diagnostics: Diagnostics): CompiledCommand | null {
  const { route, meta } = entry;
  const name = meta.name ?? route.path;
  const type = COMMAND_TYPE[meta.type ?? "chatInput"];

  if (type === ApplicationCommandType.ChatInput && !isValidChatInputName(name)) {
    reportDirectoryName(route, name, diagnostics);
    return null;
  }

  const payload: Record<string, unknown> = {
    name,
    type,
    ...localizations(meta),
    ...topLevelPayload(meta),
  };
  if (type === ApplicationCommandType.ChatInput) {
    payload.description = meta.description;
    if (meta.options !== undefined) payload.options = meta.options.map(optionPayload);
  }

  const mode = deferMode(meta);
  return {
    name,
    type,
    handlers: { "": route },
    defer: mode === null ? {} : { "": mode },
    payload: compact(payload) as unknown as RESTPostAPIApplicationCommandsJSONBody,
    files: [route.file],
  };
}

function deferMode(meta: CommandMeta): DeferMode | null {
  if (meta.defer === "ephemeral") return "ephemeral";
  return meta.defer === true ? "reply" : null;
}

function compileParentCommand(
  top: string,
  nested: LoadedRoute[],
  routeMetas: Map<string, LoadedRouteMeta>,
  diagnostics: Diagnostics,
): CompiledCommand | null {
  const parent = requireRouteMeta(top, nested[0] as LoadedRoute, routeMetas, diagnostics);
  if (parent === null) return null;
  const name = parent.meta.name ?? top;
  if (!isValidChatInputName(name)) {
    reportDirectoryName(nested[0]?.route as Route, name, diagnostics, parent.boundary.file);
    return null;
  }

  const handlers: Record<string, Route> = {};
  const defer: Record<string, DeferMode> = {};
  const files = [parent.boundary.file];
  const options: Record<string, unknown>[] = [];
  let ok = true;
  const place = (key: string, entry: LoadedRoute) => {
    handlers[key] = entry.route;
    files.push(entry.route.file);
    const mode = deferMode(entry.meta);
    if (mode !== null) defer[key] = mode;
  };

  const bySecond = new Map<string, LoadedRoute[]>();
  for (const entry of nested) {
    const second = entry.parts[1] as string;
    bySecond.set(second, [...(bySecond.get(second) ?? []), entry]);
  }

  if (bySecond.size > 25) {
    diagnostics.error(
      "too-many-subcommands",
      `"${top}" has ${bySecond.size} subcommands and groups. Discord allows 25 per command. Move some into a subcommand group or another command.`,
      { file: parent.boundary.file },
    );
    ok = false;
  }

  for (const [second, entries] of [...bySecond].sort(([a], [b]) => a.localeCompare(b))) {
    const subs = entries.filter((e) => e.parts.length === 2);
    const grouped = entries.filter((e) => e.parts.length === 3);

    if (subs.length > 0 && grouped.length > 0) {
      for (const entry of grouped) {
        diagnostics.error(
          "mixed-subcommand-and-group",
          `${relative(subs[0]?.route.file)} makes "${top} ${second}" a subcommand, and this file makes it a subcommand group. Discord doesn't allow both. Move that command.ts into its own directory under ${second}/, or move this file out.`,
          { file: entry.route.file, route: entry.route.id },
        );
      }
      ok = false;
      continue;
    }

    if (subs.length === 1) {
      const sub = compileSubcommand(subs[0] as LoadedRoute, diagnostics);
      if (sub === null) {
        ok = false;
        continue;
      }
      place(sub.name, subs[0] as LoadedRoute);
      options.push(sub.payload);
      continue;
    }

    const groupKey = `${top}/${second}`;
    const group = requireRouteMeta(groupKey, grouped[0] as LoadedRoute, routeMetas, diagnostics);
    if (group === null) {
      ok = false;
      continue;
    }
    const groupName = group.meta.name ?? second;
    if (!isValidChatInputName(groupName)) {
      reportDirectoryName(grouped[0]?.route as Route, groupName, diagnostics, group.boundary.file);
      ok = false;
      continue;
    }
    const extra = topLevelKeysUsed(group.meta);
    if (extra.length > 0) {
      diagnostics.error(
        "top-level-field-on-group",
        `${fieldList(extra)} can't be set on a subcommand group. Discord applies ${extra.length === 1 ? "it" : "them"} to the whole command, so move ${extra.length === 1 ? "it" : "them"} to ${relative(parent.boundary.file)}.`,
        { file: group.boundary.file },
      );
      ok = false;
      continue;
    }
    if (grouped.length > 25) {
      diagnostics.error(
        "too-many-subcommands",
        `The "${groupKey}" group has ${grouped.length} subcommands. Discord allows 25 per group. Move some into another group.`,
        { file: group.boundary.file },
      );
      ok = false;
      continue;
    }
    files.push(group.boundary.file);
    const groupOptions: Record<string, unknown>[] = [];
    for (const entry of grouped.sort((a, b) => a.route.path.localeCompare(b.route.path))) {
      const sub = compileSubcommand(entry, diagnostics);
      if (sub === null) {
        ok = false;
        continue;
      }
      place(`${groupName}/${sub.name}`, entry);
      groupOptions.push(sub.payload);
    }
    options.push(
      compact({
        type: ApplicationCommandOptionType.SubcommandGroup,
        name: groupName,
        description: group.meta.description,
        ...localizations(group.meta),
        options: groupOptions,
      }),
    );
  }

  if (!ok) return null;

  const payload = compact({
    name,
    type: ApplicationCommandType.ChatInput,
    description: parent.meta.description,
    ...localizations(parent.meta),
    ...topLevelPayload(parent.meta),
    options,
  }) as RESTPostAPIApplicationCommandsJSONBody;

  return { name, type: ApplicationCommandType.ChatInput, handlers, defer, payload, files };
}

function compileSubcommand(
  entry: LoadedRoute,
  diagnostics: Diagnostics,
): { name: string; route: Route; payload: Record<string, unknown> } | null {
  const { route, meta } = entry;
  if (meta.type !== undefined && meta.type !== "chatInput") {
    diagnostics.error(
      "context-menu-nested",
      `This is a context menu command, but it's nested under ${entry.parts[0]}/ as a subcommand. Discord doesn't allow context menu subcommands. Move it to its own directory directly under commands/, like commands/${entry.parts.at(-1)}/command.ts.`,
      { file: route.file, route: route.id },
    );
    return null;
  }
  const extra = topLevelKeysUsed(meta);
  if (extra.length > 0) {
    diagnostics.error(
      "top-level-field-on-subcommand",
      `${fieldList(extra)} can't be set on a subcommand. Discord applies ${extra.length === 1 ? "it" : "them"} to the whole command, so move ${extra.length === 1 ? "it" : "them"} to the route.ts in ${entry.parts[0]}/.`,
      { file: route.file, route: route.id },
    );
    return null;
  }
  const name = meta.name ?? (entry.parts.at(-1) as string);
  if (!isValidChatInputName(name)) {
    reportDirectoryName(route, name, diagnostics);
    return null;
  }
  const payload = compact({
    type: ApplicationCommandOptionType.Subcommand,
    name,
    description: meta.description,
    ...localizations(meta),
    options: meta.options?.map(optionPayload),
  });
  return { name, route, payload };
}

function requireRouteMeta(
  key: string,
  child: LoadedRoute,
  routeMetas: Map<string, LoadedRouteMeta>,
  diagnostics: Diagnostics,
): LoadedRouteMeta | null {
  const entry = routeMetas.get(key);
  if (entry !== undefined) {
    entry.used = true;
    return entry;
  }
  const dir = directoryForPath(child.route, key.split("/").length);
  diagnostics.error(
    "missing-route-meta",
    `"${key}" has subcommands but no route.ts. Discord needs a description for it, and without a command.ts that goes in route.ts. Add ${relative(path.join(dir, "route.ts"))} with export const meta = { description: "..." }.`,
    { file: child.route.file, route: child.route.id },
  );
  return null;
}

/** Directory of the Nth non-group segment of a route, walking up from the handler file. */
function directoryForPath(route: Route, depth: number): string {
  let seen = 0;
  let index = route.segments.length;
  for (let i = 0; i < route.segments.length; i++) {
    if (route.segments[i]?.type === "group") continue;
    seen++;
    if (seen === depth) {
      index = i;
      break;
    }
  }
  const levelsUp = route.segments.length - index - 1;
  let dir = path.dirname(route.file);
  for (let i = 0; i < levelsUp; i++) dir = path.dirname(dir);
  return dir;
}

function isValidChatInputName(name: string): boolean {
  return /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u.test(name) && name === name.toLowerCase();
}

function reportDirectoryName(route: Route, name: string, diagnostics: Diagnostics, file?: string) {
  diagnostics.error(
    "invalid-name",
    `"${name}" isn't a valid slash command name. Discord only allows lowercase letters, digits, hyphens, and underscores, up to 32 characters. Rename the directory, or set meta.name.`,
    { file: file ?? route.file, route: route.id },
  );
}

/** `meta.nsfw and meta.contexts` */
function fieldList(keys: string[]): string {
  return new Intl.ListFormat("en").format(keys.map((key) => `meta.${key}`));
}

function detectDuplicateNames(commands: CompiledCommand[], diagnostics: Diagnostics): void {
  const seen = new Map<string, CompiledCommand>();
  for (const command of commands) {
    const key = `${command.type}:${command.name}`;
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, command);
      continue;
    }
    diagnostics.error(
      "duplicate-command-name",
      `${relative(existing.files[0])} and ${relative(command.files[0])} both register a ${TYPE_LABEL[command.type]} named "${command.name}". Discord needs the names to be unique, so change meta.name or the directory of one of them.`,
      { file: command.files[0] as string },
    );
  }
}

function optionPayload(option: CommandOption): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: OPTION_TYPE[option.type],
    name: option.name,
    description: option.description,
    required: option.required,
    ...localizations(option),
  };
  switch (option.type) {
    case "string":
      base.choices = option.choices?.map(choicePayload);
      base.autocomplete = option.autocomplete;
      base.min_length = option.minLength;
      base.max_length = option.maxLength;
      break;
    case "integer":
    case "number":
      base.choices = option.choices?.map(choicePayload);
      base.autocomplete = option.autocomplete;
      base.min_value = option.minValue;
      base.max_value = option.maxValue;
      break;
    case "channel":
      base.channel_types = option.channelTypes;
      break;
  }
  return compact(base);
}

function choicePayload(choice: {
  name: string;
  value: string | number;
  nameLocalizations?: unknown;
}) {
  return compact({
    name: choice.name,
    value: choice.value,
    name_localizations: choice.nameLocalizations,
  });
}

function localizations(meta: { nameLocalizations?: unknown; descriptionLocalizations?: unknown }) {
  return {
    name_localizations: meta.nameLocalizations,
    description_localizations: meta.descriptionLocalizations,
  };
}

function topLevelPayload(meta: TopLevelMeta): Record<string, unknown> {
  const perms = meta.defaultMemberPermissions;
  return {
    default_member_permissions:
      perms === undefined ? undefined : perms === null ? null : String(perms),
    nsfw: meta.nsfw,
    contexts: meta.contexts,
    integration_types: meta.integrationTypes,
  };
}

function compact<T extends Record<string, unknown>>(object: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

function relative(file: string | undefined): string {
  return file === undefined ? "?" : path.relative(process.cwd(), file).split(path.sep).join("/");
}
