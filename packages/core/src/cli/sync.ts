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
import { c, credentialHint, info, ok, warn } from "./ui.js";

export const TOKEN_VAR = "DISCORD_TOKEN";
export const APPLICATION_ID_VAR = "DISCORD_APPLICATION_ID";

/** `nect sync [--dry-run] [--force]`: register the compiled commands with Discord. */
export async function sync(io: CliIo, dryRun: boolean, force: boolean): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const graph = await compileProject(project, io);
  if (graph === null) return EXIT_FAILURE;
  if (registrationScopes(project.config, project.env).length === 0) {
    throw new CliError(`No registration target for ${project.env}.`, {
      details: registrationHint(project),
    });
  }
  const result = await registerCommands(project, graph, io, { dryRun, force });
  for (const scope of result.scopes) io.out(describeScope(scope, dryRun));
  if (result.unsafe.length > 0) {
    io.err(warn(force ? "Forced past the safety guard:" : "The safety guard would refuse this:"));
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
  const token = credential(project, io, "token");
  const applicationId = credential(project, io, "applicationId");
  const rest = await (io.rest ?? discordRest)(token);
  try {
    return await syncCommands({
      rest,
      applicationId,
      commands: graph.commands.map((cmd) => cmd.payload),
      scopes: registrationScopes(project.config, project.env),
      cacheDir: project.outDir,
      dryRun: options.dryRun ?? false,
      force: options.force ?? false,
    });
  } catch (error) {
    if (error instanceof UnsafeSyncError) {
      throw new CliError("Refusing to register commands: this looks destructive.", {
        details: [
          ...error.reasons,
          "",
          `If that is what you want, run again with ${c.bold("--force")}.`,
        ],
      });
    }
    if (error instanceof RegistrationError) {
      throw new CliError(`Discord rejected the ${scopeKey(error.scope)} command registration.`, {
        details: error.problems.map(
          (p) =>
            `${c.bold(p.command ?? "(request)")}${p.field === "" ? "" : ` ${c.dim(p.field)}`}: ${p.message}`,
        ),
      });
    }
    throw error;
  }
}

/** One line per scope: what changed there and whether it was written. */
export function describeScope({ scope, diff, applied }: ScopeSync, dryRun = false): string {
  const key = c.bold(scopeKey(scope));
  if (diff === null) return ok(`${key}: unchanged since last sync.`);
  if (!diff.hasChanges) return ok(`${key}: up to date, ${diff.unchanged.length} command(s).`);
  const parts = [
    ...diff.added.map((n) => c.green(`+${n}`)),
    ...diff.changed.map((n) => c.yellow(`~${n}`)),
    ...diff.removed.map((n) => c.red(`-${n}`)),
  ].join(" ");
  if (dryRun) return info(`${key}: ${parts} ${c.dim("(would apply)")}`);
  return applied
    ? ok(`${key}: ${parts} ${c.dim("(applied)")}`)
    : warn(`${key}: ${parts} ${c.dim("(not applied)")}`);
}

export type Credential = "token" | "applicationId";

export const CREDENTIAL_VARS: Record<Credential, string> = {
  token: TOKEN_VAR,
  applicationId: APPLICATION_ID_VAR,
};

/** The config field wins; the env var is the fallback. Empty strings count as unset. */
export function findCredential(project: Project, io: CliIo, kind: Credential): string | null {
  const value = project.config[kind] || io.env[CREDENTIAL_VARS[kind]];
  return value === undefined || value === "" ? null : value;
}

export function credential(project: Project, io: CliIo, kind: Credential): string {
  const value = findCredential(project, io, kind);
  if (value === null) {
    throw new CliError(`${CREDENTIAL_VARS[kind]} is not set.`, {
      details: credentialHint(kind, projectConfigName(project)),
    });
  }
  return value;
}

export function registrationHint(project: Project): string[] {
  return [
    `Add your test server's ID to ${c.bold("dev.guilds")} in ${projectConfigName(project)}.`,
    "Find it in Discord: Server Settings → Widget → Server ID, or right-click the server",
    "with Developer Mode on and choose Copy Server ID.",
  ];
}

async function discordRest(token: string): Promise<CommandRest> {
  const { REST } = await import("discord.js");
  return new REST().setToken(token);
}

export function projectConfigName(project: Project): string {
  return project.configFile.split(/[\\/]/).at(-1) ?? "nect.config.ts";
}
