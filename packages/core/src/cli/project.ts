import { existsSync } from "node:fs";
import path from "node:path";
import { loadModule } from "../compiler/load.js";
import { ConfigError, type NeatConfig, validateConfig } from "../config.js";
import type { Env } from "../runtime/types.js";
import { CliError } from "./io.js";

export const CONFIG_FILES = ["neat.config.ts", "neat.config.js"];

export interface Project {
  /** Directory holding the config file. Every relative config path resolves against it. */
  root: string;
  configFile: string;
  config: NeatConfig;
  appDir: string;
  outDir: string;
  env: Env;
}

/** Finds and validates `neat.config.ts` in `cwd`. */
export async function loadProject(cwd: string, env: NodeJS.ProcessEnv): Promise<Project> {
  const configFile = CONFIG_FILES.map((name) => path.join(cwd, name)).find((f) => existsSync(f));
  if (configFile === undefined) {
    throw new CliError(
      `No ${CONFIG_FILES[0]} in ${cwd}. Run neat from the project root, or create one with defineConfig.`,
    );
  }
  let config: NeatConfig;
  try {
    const module = await loadModule(configFile);
    config = validateConfig(module.default, path.basename(configFile));
  } catch (error) {
    if (error instanceof ConfigError) throw new CliError(error.message);
    throw new CliError(`Could not load ${path.basename(configFile)}: ${describe(error)}`);
  }
  const root = path.dirname(configFile);
  const appDir = path.resolve(root, config.appDir ?? "app");
  if (!existsSync(appDir)) {
    throw new CliError(`App directory ${path.relative(root, appDir) || "."} does not exist.`);
  }
  return {
    root,
    configFile,
    config,
    appDir,
    outDir: path.resolve(root, config.outDir ?? ".neat"),
    env: config.env ?? envFrom(env.NODE_ENV),
  };
}

export function envFrom(value: string | undefined): Env {
  return value === "production" || value === "test" ? value : "development";
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
