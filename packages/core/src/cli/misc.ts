import { existsSync, rmSync } from "node:fs";
import { registrationScopes, scopeKey } from "../registration/index.js";
import { version } from "../version.js";
import { relative } from "./compile.js";
import { CliError, type CliIo, EXIT_OK } from "./io.js";
import { loadProject } from "./project.js";
import { APPLICATION_ID_VAR, TOKEN_VAR } from "./sync.js";

/** `nect clean`: delete the build output directory. */
export async function clean(io: CliIo): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const label = `${relative(project.root, project.outDir)}/`;
  if (!existsSync(project.outDir)) {
    io.out(`Nothing to remove, ${label} does not exist.`);
    return EXIT_OK;
  }
  rmSync(project.outDir, { recursive: true, force: true });
  io.out(`Removed ${label}`);
  return EXIT_OK;
}

/** `nect info`: versions, environment, and the config values that decide runtime behaviour. */
export async function info(io: CliIo): Promise<number> {
  const rows: [string, string][] = [
    ["nect", version],
    ["node", process.version],
    ["discord.js", await discordVersion()],
    ["platform", `${process.platform} ${process.arch}`],
    [TOKEN_VAR, present(io.env[TOKEN_VAR])],
    [APPLICATION_ID_VAR, present(io.env[APPLICATION_ID_VAR])],
  ];

  try {
    const project = await loadProject(io.cwd, io.env);
    const { config } = project;
    const scopes = registrationScopes(config, project.env);
    rows.push(
      ["config", relative(project.root, project.configFile)],
      ["env", project.env],
      ["appDir", relative(project.root, project.appDir) || "."],
      ["outDir", relative(project.root, project.outDir)],
      ["intents", describeBitfield(config.intents)],
      ["partials", config.partials === undefined ? "none" : String(config.partials.length)],
      ["eager", String(config.eager ?? project.env === "production")],
      ["registration", scopes.length === 0 ? "none" : scopes.map(scopeKey).join(", ")],
    );
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    rows.push(["config", error.message]);
  }

  const width = Math.max(...rows.map(([key]) => key.length));
  for (const [key, value] of rows) io.out(`${key.padEnd(width)}  ${value}`);
  return EXIT_OK;
}

async function discordVersion(): Promise<string> {
  try {
    const { version: v } = await import("discord.js");
    return v;
  } catch {
    return "not installed";
  }
}

function present(value: string | undefined): string {
  return value === undefined || value === "" ? "not set" : "set";
}

function describeBitfield(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.map(String).join(", ");
  return String(value);
}
