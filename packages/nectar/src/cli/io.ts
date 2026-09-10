import type { Client } from "discord.js";
import type { NectarConfig } from "../config.js";
import type { CommandRest } from "../registration/index.js";

/** What a CLI command can touch. The bin passes the real process; tests pass buffers. */
export interface CliIo {
  cwd: string;
  env: NodeJS.ProcessEnv;
  out(line: string): void;
  err(line: string): void;
  /** Builds the REST client `sync` talks to. Tests swap in a fake. */
  rest?: (token: string) => Promise<CommandRest>;
  /** Builds the discord.js client `dev` and `start` run. Tests swap in a fake that never logs in. */
  client?: (config: NectarConfig) => Client;
}

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

/**
 * A problem the user can fix. Printed without a stack trace: the message as the headline,
 * then `details` indented under it (what went wrong in full, and what to do about it).
 */
export class CliError extends Error {
  readonly code: number;
  readonly details: readonly string[];

  constructor(message: string, options: { code?: number; details?: readonly string[] } = {}) {
    super(message);
    this.name = "CliError";
    this.code = options.code ?? EXIT_FAILURE;
    this.details = options.details ?? [];
  }
}
