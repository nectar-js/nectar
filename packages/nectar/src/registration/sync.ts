import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type APIApplicationCommand,
  ApplicationCommandType,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { stableStringify } from "../manifest/emit.js";
import { type CommandDiff, diffCommands } from "./diff.js";
import { commandKey, normalizeCommand } from "./normalize.js";
import { type CommandRest, fetchCommands, putCommands, type Scope, scopeKey } from "./remote.js";

export const REGISTRATION_CACHE_FILE = "registration.json";
const CACHE_VERSION = 1;

/**
 * The command types an app declares. Other commands in a scope, like the Entry Point command
 * Discord creates for Activities, go back unchanged in every overwrite: Discord rejects one
 * that drops them, with error 50240.
 */
const DECLARED_TYPES: ReadonlySet<number> = new Set([
  ApplicationCommandType.ChatInput,
  ApplicationCommandType.User,
  ApplicationCommandType.Message,
]);

/** What the last successful sync sent, so an unchanged app skips the remote read. */
interface RegistrationCache {
  version: typeof CACHE_VERSION;
  applicationId: string;
  /** Scope key to hash of the normalized payloads registered there. */
  scopes: Record<string, string>;
}

export interface SyncOptions {
  rest: CommandRest;
  applicationId: string;
  commands: RESTPostAPIApplicationCommandsJSONBody[];
  scopes: Scope[];
  /** Directory holding `registration.json`. No cache when omitted. */
  cacheDir?: string;
  /** Compute diffs and report, but write nothing to Discord or the cache. */
  dryRun?: boolean;
  /** Proceed past the safety guard. */
  force?: boolean;
}

export interface ScopeSync {
  scope: Scope;
  /** `null` when the cache proved nothing changed and Discord was not consulted. */
  diff: CommandDiff | null;
  /** A bulk overwrite was sent. */
  applied: boolean;
}

export interface SyncResult {
  scopes: ScopeSync[];
  /** Why the guard would block this sync. Empty when it is safe. */
  unsafe: string[];
}

/** Thrown instead of applying when the guard trips and `force` is not set. */
export class UnsafeSyncError extends Error {
  constructor(readonly reasons: string[]) {
    super(
      `Refusing to register commands:\n${reasons.map((r) => `  ${r}`).join("\n")}\nPass force to do it anyway.`,
    );
    this.name = "UnsafeSyncError";
  }
}

/**
 * Reconciles every scope: read remote, diff, bulk overwrite only when something differs.
 * All scopes are read and checked before any is written, so a guard failure changes nothing.
 */
export async function syncCommands(options: SyncOptions): Promise<SyncResult> {
  const {
    rest,
    applicationId,
    commands,
    scopes,
    cacheDir,
    dryRun = false,
    force = false,
  } = options;
  const cache = cacheDir === undefined ? null : readCache(cacheDir);
  const hash = hashCommands(commands);
  const unsafe: string[] = [];

  if (cache !== null && cache.applicationId !== applicationId) {
    unsafe.push(
      `The application ID changed from ${cache.applicationId} to ${applicationId}. Commands registered under the old application are left as they are.`,
    );
  }
  const targets = new Set(scopes.map(scopeKey));
  for (const key of Object.keys(cache?.scopes ?? {})) {
    if (!targets.has(key)) {
      unsafe.push(
        `${key} received commands last time but is no longer a target. Its commands stay registered on Discord until removed.`,
      );
    }
  }

  const results: ScopeSync[] = [];
  /** Remote commands of other types, by scope key, to send back in the overwrite. */
  const kept = new Map<string, RESTPostAPIApplicationCommandsJSONBody[]>();
  for (const scope of scopes) {
    const key = scopeKey(scope);
    const cached =
      cache !== null && cache.applicationId === applicationId && cache.scopes[key] === hash;
    if (cached) {
      results.push({ scope, diff: null, applied: false });
      continue;
    }
    const remote = await fetchCommands(rest, applicationId, scope);
    const declared = remote.filter((c) => DECLARED_TYPES.has(c.type));
    kept.set(key, remote.filter((c) => !DECLARED_TYPES.has(c.type)).map(resubmit));
    const diff = diffCommands(commands, declared);
    if (commands.length === 0 && declared.length > 0) {
      unsafe.push(`${key} has ${declared.length} command(s) registered and the app declares none.`);
    }
    results.push({ scope, diff, applied: false });
  }

  if (dryRun) return { scopes: results, unsafe };
  if (unsafe.length > 0 && !force) throw new UnsafeSyncError(unsafe);

  const next: RegistrationCache = { version: CACHE_VERSION, applicationId, scopes: {} };
  for (const result of results) {
    if (result.diff?.hasChanges) {
      const body = [...commands, ...(kept.get(scopeKey(result.scope)) ?? [])];
      await putCommands(rest, applicationId, result.scope, body);
      result.applied = true;
    }
    next.scopes[scopeKey(result.scope)] = hash;
    // Persist after every scope so a failure halfway does not forget the ones already done.
    if (cacheDir !== undefined) writeCache(cacheDir, next);
  }
  return { scopes: results, unsafe };
}

/** A fetched command as an overwrite takes it, without the fields Discord fills in itself. */
function resubmit(command: APIApplicationCommand): RESTPostAPIApplicationCommandsJSONBody {
  const {
    id: _id,
    application_id: _application,
    guild_id: _guild,
    version: _version,
    name_localized: _name,
    description_localized: _description,
    ...body
  } = command;
  // Its type is one Nectar doesn't declare, so the body is passed through as Discord gave it.
  return body as RESTPostAPIApplicationCommandsJSONBody;
}

/** Order-insensitive, like the diff: reordering commands is not a change. */
function hashCommands(commands: RESTPostAPIApplicationCommandsJSONBody[]): string {
  const normalized = commands
    .map((c) => [commandKey(c), normalizeCommand(c)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, c]) => c);
  return createHash("sha256").update(stableStringify(normalized)).digest("hex");
}

function readCache(dir: string): RegistrationCache | null {
  let text: string;
  try {
    text = readFileSync(path.join(dir, REGISTRATION_CACHE_FILE), "utf8");
  } catch {
    return null;
  }
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== CACHE_VERSION
  ) {
    return null;
  }
  return parsed as RegistrationCache;
}

function writeCache(dir: string, cache: RegistrationCache) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, REGISTRATION_CACHE_FILE), `${stableStringify(cache)}\n`);
}
