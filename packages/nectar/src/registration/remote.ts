import type {
  APIApplicationCommand,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { Routes } from "discord-api-types/v10";
import { RegistrationError } from "./errors.js";

/** The two calls registration needs. discord.js's `REST` satisfies this. */
export interface CommandRest {
  get(route: `/${string}`, options?: { query: URLSearchParams }): Promise<unknown>;
  put(route: `/${string}`, options: { body: unknown }): Promise<unknown>;
}

export type Scope = "global" | { guild: string };

/** `global` or `guild:<id>`. Used for cache keys and messages. */
export function scopeKey(scope: Scope): string {
  return scope === "global" ? "global" : `guild:${scope.guild}`;
}

function scopeRoute(applicationId: string, scope: Scope): `/${string}` {
  return scope === "global"
    ? Routes.applicationCommands(applicationId)
    : Routes.applicationGuildCommands(applicationId, scope.guild);
}

/** With full localization maps, which Discord leaves out unless asked. */
export async function fetchCommands(
  rest: CommandRest,
  applicationId: string,
  scope: Scope,
): Promise<APIApplicationCommand[]> {
  return (await rest.get(scopeRoute(applicationId, scope), {
    query: new URLSearchParams({ with_localizations: "true" }),
  })) as APIApplicationCommand[];
}

/** Bulk overwrite: Discord replaces the scope's whole command set with `commands`. */
export async function putCommands(
  rest: CommandRest,
  applicationId: string,
  scope: Scope,
  commands: RESTPostAPIApplicationCommandsJSONBody[],
): Promise<void> {
  try {
    await rest.put(scopeRoute(applicationId, scope), { body: commands });
  } catch (error) {
    throw RegistrationError.from(error, scope, commands) ?? error;
  }
}
