import type { RouteGraph } from "../compiler/graph.js";
import {
  type CommandRest,
  RegistrationError,
  registrationScopes,
  type ScopeSync,
  type SyncResult,
  scopeKey,
  syncCommands,
  UnsafeSyncError,
} from "../registration/index.js";
import { compileProject } from "./compile.js";
import { CliError, type CliIo, EXIT_FAILURE, EXIT_OK } from "./io.js";
import { loadProject, type Project } from "./project.js";

export const TOKEN_VAR = "DISCORD_TOKEN";
export const APPLICATION_ID_VAR = "DISCORD_APPLICATION_ID";

/** `nect sync [--dry-run] [--force]`: register the compiled commands with Discord. */
export async function sync(io: CliIo, dryRun: boolean, force: boolean): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const graph = await compileProject(project, io);
  if (graph === null) return EXIT_FAILURE;
  if (registrationScopes(project.config, project.env).length === 0) {
    throw new CliError(
      `No registration target for ${project.env}: add dev.guilds to ${projectConfigName(project)}.`,
    );
  }
  const result = await registerCommands(project, graph, io, { dryRun, force });
  for (const scope of result.scopes) io.out(describeScope(scope, dryRun));
  if (result.unsafe.length > 0) {
    io.err(`${force ? "Forced past" : "Would refuse"}:`);
    for (const reason of result.unsafe) io.err(`  ${reason}`);
  }
  return EXIT_OK;
}

/**
 * Registers a compiled graph's commands in this environment's scopes. Missing credentials,
 * the safety guard, and Discord validation failures all surface as `CliError`.
 */
export async function registerCommands(
  project: Project,
  graph: RouteGraph,
  io: CliIo,
  options: { dryRun?: boolean; force?: boolean } = {},
): Promise<SyncResult> {
  const token = requireEnv(io, TOKEN_VAR);
  const applicationId = requireEnv(io, APPLICATION_ID_VAR);
  const rest = await (io.rest ?? discordRest)(token);
  try {
    return await syncCommands({
      rest,
      applicationId,
      commands: graph.commands.map((c) => c.payload),
      scopes: registrationScopes(project.config, project.env),
      cacheDir: project.outDir,
      dryRun: options.dryRun ?? false,
      force: options.force ?? false,
    });
  } catch (error) {
    if (error instanceof UnsafeSyncError || error instanceof RegistrationError) {
      throw new CliError(error.message);
    }
    throw error;
  }
}

export function describeScope({ scope, diff, applied }: ScopeSync, dryRun = false): string {
  const key = scopeKey(scope);
  if (diff === null) return `${key}: unchanged since last sync.`;
  if (!diff.hasChanges) return `${key}: up to date, ${diff.unchanged.length} command(s).`;
  const parts = [
    ...diff.added.map((n) => `+${n}`),
    ...diff.changed.map((n) => `~${n}`),
    ...diff.removed.map((n) => `-${n}`),
  ];
  const verb = dryRun ? "would apply" : applied ? "applied" : "not applied";
  return `${key}: ${parts.join(" ")} (${verb}).`;
}

export function requireEnv(io: CliIo, name: string): string {
  const value = io.env[name];
  if (value === undefined || value === "") {
    throw new CliError(`${name} is not set. Put it in .env or the environment.`);
  }
  return value;
}

async function discordRest(token: string): Promise<CommandRest> {
  const { REST } = await import("discord.js");
  return new REST().setToken(token);
}

export function projectConfigName(project: Project): string {
  return project.configFile.split(/[\\/]/).at(-1) ?? "nect.config.ts";
}
