import { existsSync, rmSync } from "node:fs";
import { registrationScopes, scopeKey } from "../registration/index.js";
import { version } from "../version.js";
import { relative } from "./compile.js";
import { CliError, type CliIo, EXIT_OK } from "./io.js";
import { loadProject } from "./project.js";
import { APPLICATION_ID_VAR, findCredential, TOKEN_VAR } from "./sync.js";
import { c, info as note, ok, table } from "./ui.js";

/** `nect clean`: delete the build output directory. */
export async function clean(io: CliIo): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const label = `${relative(project.root, project.outDir)}/`;
  if (!existsSync(project.outDir)) {
    io.out(note(`Nothing to remove, ${c.bold(label)} does not exist.`));
    return EXIT_OK;
  }
  rmSync(project.outDir, { recursive: true, force: true });
  io.out(ok(`Removed ${c.bold(label)}`));
  return EXIT_OK;
}

/** `nect info`: versions, environment, and the config values that decide runtime behaviour. */
export async function info(io: CliIo): Promise<number> {
  const rows: [string, string][] = [
    ["nect", version],
    ["node", process.version],
    ["discord.js", await discordVersion()],
    ["platform", `${process.platform} ${process.arch}`],
  ];

  try {
    const project = await loadProject(io.cwd, io.env);
    const { config } = project;
    const scopes = registrationScopes(config, project.env);
    rows.push(
      [TOKEN_VAR, present(findCredential(project, io, "token"))],
      [APPLICATION_ID_VAR, present(findCredential(project, io, "applicationId"))],
      ["config", relative(project.root, project.configFile)],
      ["env", project.env],
      ["appDir", relative(project.root, project.appDir) || "."],
      ["outDir", relative(project.root, project.outDir)],
      ["intents", describeBitfield(config.intents)],
      ["partials", config.partials === undefined ? "none" : String(config.partials.length)],
      ["eager", String(config.eager ?? project.env === "production")],
      ["registration", scopes.length === 0 ? c.yellow("none") : scopes.map(scopeKey).join(", ")],
    );
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    rows.push(
      [TOKEN_VAR, present(io.env[TOKEN_VAR] || null)],
      [APPLICATION_ID_VAR, present(io.env[APPLICATION_ID_VAR] || null)],
      ["config", c.yellow(error.message)],
    );
  }

  for (const line of table(rows)) io.out(line);
  return EXIT_OK;
}

async function discordVersion(): Promise<string> {
  try {
    const { version: v } = await import("discord.js");
    return v;
  } catch {
    return c.yellow("not installed");
  }
}

function present(value: string | null): string {
  return value === null || value === "" ? c.yellow("not set") : c.green("set");
}

function describeBitfield(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.map(String).join(", ");
  return String(value);
}
