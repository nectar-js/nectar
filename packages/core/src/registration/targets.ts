import type { NectConfig } from "../config.js";
import type { Env } from "../runtime/types.js";
import type { Scope } from "./remote.js";

/**
 * Where this environment registers commands. Development and test use `dev.guilds` only, so a
 * project without dev guilds registers nothing until some are configured. Production uses
 * `commands.target`, global by default.
 */
export function registrationScopes(
  config: Pick<NectConfig, "dev" | "commands">,
  env: Env,
): Scope[] {
  if (env !== "production") return (config.dev?.guilds ?? []).map((guild) => ({ guild }));
  const target = config.commands?.target ?? "global";
  return target === "global" ? ["global"] : target.map((guild) => ({ guild }));
}
