import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { PluginError } from "../plugins/index.js";
import { version } from "../version.js";
import { build, check } from "./build.js";
import { dev } from "./dev.js";
import { CliError, type CliIo, EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from "./io.js";
import { manifest } from "./manifest.js";
import { clean, info } from "./misc.js";
import { CONFIG_FILES, describe, loadProject } from "./project.js";
import { routes } from "./routes.js";
import { start } from "./start.js";
import { sync } from "./sync.js";
import { block, c, fail, indent } from "./ui.js";

export type { CliIo } from "./io.js";
export { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from "./io.js";
export { setColors } from "./ui.js";

interface Command {
  usage: string;
  description: string;
  options?: Record<string, { type: "boolean" | "string"; description: string }>;
  run(io: CliIo, flags: Record<string, string | boolean | undefined>): Promise<number>;
}

const COMMANDS: Record<string, Command> = {
  dev: {
    usage: "dev [--verbose]",
    description: "Compile, register dev guild commands, run the bot, and reload on changes.",
    options: {
      verbose: { type: "boolean", description: "Print the route tree and discord.js warnings." },
    },
    run: (io, flags) => dev(io, flags.verbose === true),
  },
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

/**
 * Commands contributed by the config's plugins. Loading the config can fail; for help that is
 * silent, for a command it is the error the user needs to see.
 */
async function pluginCommands(io: CliIo, tolerant: boolean): Promise<Record<string, Command>> {
  if (!CONFIG_FILES.some((file) => existsSync(path.join(io.cwd, file)))) return {};
  const commands: Record<string, Command> = {};
  try {
    const project = await loadProject(io.cwd, io.env);
    for (const plugin of project.config.plugins ?? []) {
      for (const command of plugin.commands ?? []) {
        const options = command.options ?? {};
        const usage = [
          command.name,
          ...Object.entries(options).map(
            ([key, opt]) => `[--${key}${opt.type === "string" ? " <value>" : ""}]`,
          ),
        ].join(" ");
        commands[command.name] = {
          usage,
          description: command.description,
          options,
          run: async (io, flags) => command.run({ project, flags, out: io.out, err: io.err }),
        };
      }
    }
  } catch (error) {
    if (!tolerant || !(error instanceof CliError)) throw error;
  }
  return commands;
}

/** Runs one CLI invocation. `argv` excludes the node and script entries. */
export async function run(argv: string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === "--help" || name === "-h" || name === "help") {
    io.out(help(await pluginCommands(io, true)));
    return name === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (name === "--version" || name === "-v") {
    io.out(version);
    return EXIT_OK;
  }
  let command = COMMANDS[name];
  if (command === undefined) {
    try {
      command = (await pluginCommands(io, false))[name];
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      io.err(block(fail(error.message), error.details));
      return error.code;
    }
  }
  if (command === undefined) {
    io.err(
      block(fail(`Unknown command ${c.bold(`"${name}"`)}.`), [
        `Run ${c.bold("nectar --help")} to see the commands.`,
      ]),
    );
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
    io.err(fail(describe(error)));
    io.err("");
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
      io.err(block(fail(error.message), error.details));
      return error.code;
    }
    if (error instanceof PluginError) {
      io.err(block(fail(error.message), [`Fix or remove the plugin in your config.`]));
      return EXIT_FAILURE;
    }
    io.err(
      block(fail("Something went wrong inside Nectar."), [
        "This is a bug in Nectar, not in your app. The details:",
        "",
        ...(error instanceof Error ? (error.stack ?? error.message) : String(error))
          .split("\n")
          .map((line) => c.dim(line)),
      ]),
    );
    return EXIT_FAILURE;
  }
}

function help(plugins: Record<string, Command>): string {
  const all = [...Object.values(COMMANDS), ...Object.values(plugins)];
  const width = Math.max(...all.map((cmd) => cmd.usage.length));
  const row = (cmd: Command) => `  ${c.cyan(cmd.usage.padEnd(width))}  ${c.dim(cmd.description)}`;
  return [
    `${c.bold("nectar")} ${c.dim(`v${version}`)}  A filesystem-based meta-framework for discord.js.`,
    "",
    `${c.bold("Usage:")} nectar <command> [options]`,
    "",
    c.bold("Commands:"),
    ...Object.values(COMMANDS).map(row),
    ...(Object.keys(plugins).length === 0
      ? []
      : ["", c.bold("Plugin commands:"), ...Object.values(plugins).map(row)]),
    "",
    c.bold("Options:"),
    `  ${c.cyan("--help, -h".padEnd(width))}  ${c.dim("Show help for nectar or a command.")}`,
    `  ${c.cyan("--version, -v".padEnd(width))}  ${c.dim("Print the version.")}`,
  ].join("\n");
}

function commandHelp(command: Command): string {
  const options = Object.entries(command.options ?? {});
  const lines = [`${c.bold("Usage:")} nectar ${command.usage}`, "", command.description];
  if (options.length > 0) {
    const width = Math.max(...options.map(([key]) => key.length));
    lines.push(
      "",
      c.bold("Options:"),
      ...indent(
        options.map(
          ([key, opt]) => `${c.cyan(`--${key.padEnd(width)}`)}  ${c.dim(opt.description)}`,
        ),
      ),
    );
  }
  return lines.join("\n");
}
