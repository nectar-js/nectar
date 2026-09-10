import { existsSync } from "node:fs";
import path from "node:path";
import { loadModule } from "../compiler/load.js";
import { ConfigError, type NectarConfig, validateConfig } from "../config.js";
import type { Env } from "../runtime/types.js";
import { CliError } from "./io.js";
import { c } from "./ui.js";

export const CONFIG_FILES = ["nectar.config.ts", "nectar.config.js"];

export interface Project {
  /** Directory holding the config file. Every relative config path resolves against it. */
  root: string;
  configFile: string;
  config: NectarConfig;
  appDir: string;
  outDir: string;
  env: Env;
}

/** Finds and validates `nectar.config.ts` in `cwd`. */
export async function loadProject(cwd: string, env: NodeJS.ProcessEnv): Promise<Project> {
  const configFile = CONFIG_FILES.map((name) => path.join(cwd, name)).find((f) => existsSync(f));
  if (configFile === undefined) {
    throw new CliError(`No ${CONFIG_FILES[0]} in ${cwd}.`, {
      details: [
        "Run nectar from the directory that holds your config file.",
        `Starting fresh? ${c.bold("npm create @nectar-js")} sets up a project.`,
      ],
    });
  }
  const name = path.basename(configFile);
  let config: NectarConfig;
  try {
    const module = await loadModule(configFile);
    config = validateConfig(module.default, name);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new CliError(`${name} is not valid.`, { details: [error.detail] });
    }
    throw new CliError(`Could not load ${name}.`, { details: [describe(error)] });
  }
  const root = path.dirname(configFile);
  const appDir = path.resolve(root, config.appDir ?? "app");
  if (!existsSync(appDir)) {
    throw new CliError(`App directory ${path.relative(root, appDir) || "."}/ does not exist.`, {
      details: [`Create it, or point ${c.bold("appDir")} in ${name} at the right place.`],
    });
  }
  return {
    root,
    configFile,
    config,
    appDir,
    outDir: path.resolve(root, config.outDir ?? ".nectar"),
    env: config.env ?? envFrom(env.NODE_ENV),
  };
}

export function envFrom(value: string | undefined): Env {
  return value === "production" || value === "test" ? value : "development";
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
