import { parseArgs } from "node:util";
import { version } from "../version.js";
import { build, check } from "./build.js";
import { CliError, type CliIo, EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from "./io.js";
import { manifest } from "./manifest.js";
import { clean, info } from "./misc.js";
import { describe } from "./project.js";
import { routes } from "./routes.js";
import { start } from "./start.js";
import { sync } from "./sync.js";

export type { CliIo } from "./io.js";
export { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from "./io.js";

interface Command {
  usage: string;
  description: string;
  options?: Record<string, { type: "boolean" | "string"; description: string }>;
  run(io: CliIo, flags: Record<string, string | boolean | undefined>): Promise<number>;
}

const COMMANDS: Record<string, Command> = {
  build: {
    usage: "build",
    description: "Compile the app and write the manifest and types.",
    run: (io) => build(io),
  },
  check: {
    usage: "check",
    description: "Compile and report problems without writing anything.",
    run: (io) => check(io),
  },
  routes: {
    usage: "routes",
    description: "Show the app tree: commands, components, events, middleware, error boundaries.",
    run: (io) => routes(io),
  },
  manifest: {
    usage: "manifest [--route <id>]",
    description: "Print the compiled manifest, or everything about one route.",
    options: {
      route: { type: "string", description: "Route ID or path, e.g. command:moderation/ban." },
    },
    run: (io, flags) => manifest(io, flags.route as string | undefined),
  },
  sync: {
    usage: "sync [--dry-run] [--force]",
    description: "Register commands with Discord, writing only scopes that changed.",
    options: {
      "dry-run": { type: "boolean", description: "Show the diff without changing anything." },
      force: { type: "boolean", description: "Proceed even when the change looks destructive." },
    },
    run: (io, flags) => sync(io, flags["dry-run"] === true, flags.force === true),
  },
  start: {
    usage: "start",
    description: "Run the bot from the last build.",
    run: (io) => start(io),
  },
  clean: {
    usage: "clean",
    description: "Delete the build output directory.",
    run: (io) => clean(io),
  },
  info: {
    usage: "info",
    description: "Show versions, environment, and the effective config.",
    run: (io) => info(io),
  },
};

/** Runs one CLI invocation. `argv` excludes the node and script entries. */
export async function run(argv: string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === "--help" || name === "-h" || name === "help") {
    io.out(help());
    return name === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (name === "--version" || name === "-v") {
    io.out(version);
    return EXIT_OK;
  }
  const command = COMMANDS[name];
  if (command === undefined) {
    io.err(`Unknown command "${name}".`);
    io.err(help());
    return EXIT_USAGE;
  }

  let flags: Record<string, string | boolean | undefined>;
  try {
    const parsed = parseArgs({
      args: rest,
      options: {
        ...Object.fromEntries(
          Object.entries(command.options ?? {}).map(([key, opt]) => [key, { type: opt.type }]),
        ),
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    });
    flags = parsed.values;
  } catch (error) {
    io.err(describe(error));
    io.err(commandHelp(command));
    return EXIT_USAGE;
  }
  if (flags.help === true) {
    io.out(commandHelp(command));
    return EXIT_OK;
  }

  try {
    return await command.run(io, flags);
  } catch (error) {
    if (error instanceof CliError) {
      io.err(error.message);
      return error.code;
    }
    io.err(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return EXIT_FAILURE;
  }
}

function help(): string {
  const width = Math.max(...Object.values(COMMANDS).map((c) => c.usage.length));
  return [
    `neat ${version}`,
    "",
    "Usage: neat <command> [options]",
    "",
    "Commands:",
    ...Object.values(COMMANDS).map((c) => `  ${c.usage.padEnd(width)}  ${c.description}`),
    "",
    "Options:",
    "  --help, -h     Show help for neat or a command.",
    "  --version, -v  Print the version.",
  ].join("\n");
}

function commandHelp(command: Command): string {
  const options = Object.entries(command.options ?? {});
  const lines = [`Usage: neat ${command.usage}`, "", command.description];
  if (options.length > 0) {
    const width = Math.max(...options.map(([key]) => key.length));
    lines.push(
      "",
      "Options:",
      ...options.map(([key, opt]) => `  --${key.padEnd(width)}  ${opt.description}`),
    );
  }
  return lines.join("\n");
}
