import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import { type Scope, scopeKey } from "./remote.js";

export interface RegistrationProblem {
  /** Command name, or `null` when Discord rejected the request as a whole. */
  command: string | null;
  /** Dotted path inside the command, with option and choice indices replaced by their names. */
  field: string;
  message: string;
}

/** Discord rejected a bulk overwrite. Wraps the `DiscordAPIError` with per-command detail. */
export class RegistrationError extends Error {
  constructor(
    readonly scope: Scope,
    readonly problems: RegistrationProblem[],
    override readonly cause: unknown,
  ) {
    super(
      `Discord rejected the ${scopeKey(scope)} command registration:\n${problems
        .map(
          (p) =>
            `  ${p.command ?? "(request)"}${p.field === "" ? "" : ` ${p.field}`}: ${p.message}`,
        )
        .join("\n")}`,
    );
    this.name = "RegistrationError";
  }

  /** `null` when `error` is not a Discord API error. */
  static from(
    error: unknown,
    scope: Scope,
    commands: RESTPostAPIApplicationCommandsJSONBody[],
  ): RegistrationError | null {
    if (!isDiscordApiError(error)) return null;
    const problems: RegistrationProblem[] = [];
    if (error.rawError.errors !== undefined) {
      collect(error.rawError.errors, [], commands, problems);
    }
    if (problems.length === 0) {
      problems.push({ command: null, field: "", message: error.rawError.message });
    }
    return new RegistrationError(scope, problems, error);
  }
}

interface DiscordApiErrorLike {
  rawError: { message: string; errors?: unknown };
}

function isDiscordApiError(error: unknown): error is DiscordApiErrorLike {
  if (typeof error !== "object" || error === null || !("rawError" in error)) return false;
  const raw = (error as { rawError: unknown }).rawError;
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { message?: unknown }).message === "string"
  );
}

/**
 * Discord nests errors by request path, `{ "0": { options: { "1": { description: { _errors } } } } }`.
 * The top-level index is the command in the bulk body; deeper indices are options and choices.
 */
function collect(
  node: unknown,
  path: (string | number)[],
  commands: RESTPostAPIApplicationCommandsJSONBody[],
  out: RegistrationProblem[],
) {
  if (typeof node === "string") {
    out.push(problem(path, commands, node));
    return;
  }
  if (typeof node !== "object" || node === null) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "_errors" && Array.isArray(value)) {
      for (const entry of value) {
        const message =
          typeof entry === "object" && entry !== null && "message" in entry
            ? String((entry as { message: unknown }).message)
            : String(entry);
        out.push(problem(path, commands, message));
      }
    } else {
      collect(value, [...path, /^\d+$/.test(key) ? Number(key) : key], commands, out);
    }
  }
}

function problem(
  path: (string | number)[],
  commands: RESTPostAPIApplicationCommandsJSONBody[],
  message: string,
): RegistrationProblem {
  const [first, ...rest] = path;
  const command = typeof first === "number" ? commands[first] : undefined;
  if (command === undefined) return { command: null, field: path.join("."), message };

  const field: string[] = [];
  let cursor: unknown = command;
  for (const segment of rest) {
    if (typeof segment === "number" && Array.isArray(cursor)) {
      cursor = cursor[segment];
      const name = (cursor as { name?: unknown } | undefined)?.name;
      field.push(typeof name === "string" ? name : String(segment));
    } else {
      cursor = (cursor as Record<string, unknown> | undefined)?.[segment];
      field.push(String(segment));
    }
  }
  return { command: command.name, field: field.join("."), message };
}
