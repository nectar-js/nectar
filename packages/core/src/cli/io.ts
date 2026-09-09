import type { Client } from "discord.js";
import type { NectConfig } from "../config.js";
import type { CommandRest } from "../registration/index.js";

/** What a CLI command can touch. The bin passes the real process; tests pass buffers. */
export interface CliIo {
  cwd: string;
  env: NodeJS.ProcessEnv;
  out(line: string): void;
  err(line: string): void;
  /** Builds the REST client `sync` talks to. Tests swap in a fake. */
  rest?: (token: string) => Promise<CommandRest>;
  /** Builds the discord.js client `dev` runs. Tests swap in a fake that never logs in. */
  client?: (config: NectConfig) => Client;
}

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

/** A problem the user can fix. Printed without a stack trace. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly code: number = EXIT_FAILURE,
  ) {
    super(message);
    this.name = "CliError";
  }
}
