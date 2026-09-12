import { createWriteStream, existsSync, readFileSync, type WriteStream } from "node:fs";
import path from "node:path";
import { definePlugin, type NectarPlugin } from "@nectar-js/nectar";

declare global {
  /** Filled in by the plugin's `types` hook with every command path in the app. */
  interface NectarUsageCommands {}
}

/** A command path like `"user/profile"`. Any string until `nectar build` generates the list. */
export type UsageCommand = [keyof NectarUsageCommands] extends [never]
  ? string
  : keyof NectarUsageCommands & string;

export interface UsageLog {
  record(command: UsageCommand, userId: string): void;
}

declare module "@nectar-js/nectar" {
  interface NectarServices {
    usage: UsageLog;
  }
}

const middleware = path.join(import.meta.dirname, "middleware.ts");

/**
 * Logs a line for every command run and adds `nectar usage` to count them. `file` is relative
 * to the project root.
 */
export function usage({ file = "usage.log" } = {}): NectarPlugin {
  let stream: WriteStream | undefined;

  return definePlugin({
    name: "usage",

    // Every command gets the middleware, so the app needs no middleware.ts for it. An app
    // without commands has nothing to count, which is worth a warning at build time.
    transform(graph) {
      const commands = graph.routes.filter((route) => route.kind === "command");
      if (commands.length === 0) {
        return [
          {
            type: "diagnostic",
            severity: "warning",
            code: "usage-empty",
            message: "No commands to count.",
          },
        ];
      }
      return commands.map((route) => ({
        type: "middleware",
        route: route.id,
        kind: "command",
        file: middleware,
      }));
    },

    // Appended to .nectar/types.d.ts, so record() only accepts commands the app has.
    types: (graph) =>
      [
        "declare global {",
        "  interface NectarUsageCommands {",
        ...graph.routes
          .filter((route) => route.kind === "command")
          .map((route) => `    ${JSON.stringify(route.path)}: true;`),
        "  }",
        "}",
      ].join("\n"),

    // nectar runs from the project root, so a relative path resolves next to the config.
    start() {
      const log = createWriteStream(path.resolve(file), { flags: "a" });
      stream = log;
      return {
        usage: {
          record(command, userId) {
            log.write(`${JSON.stringify({ at: new Date().toISOString(), command, userId })}\n`);
          },
        },
      };
    },

    // Once per bot start, however many shards there are, so the log shows restarts.
    startGlobal() {
      stream?.write(`${JSON.stringify({ at: new Date().toISOString(), event: "start" })}\n`);
    },

    stopGlobal() {
      stream?.write(`${JSON.stringify({ at: new Date().toISOString(), event: "stop" })}\n`);
    },

    async stop() {
      const log = stream;
      stream = undefined;
      if (log !== undefined) {
        await new Promise<void>((resolve) => {
          log.end(resolve);
        });
      }
    },

    commands: [
      {
        name: "usage",
        description: "Count command runs in the usage log.",
        run({ project, out }) {
          const log = path.resolve(project.root, file);
          if (!existsSync(log)) {
            out("No command runs logged yet.");
            return 0;
          }
          const counts = new Map<string, number>();
          for (const line of readFileSync(log, "utf8").split("\n")) {
            if (line === "") continue;
            const { command } = JSON.parse(line) as { command?: string };
            if (command === undefined) continue;
            counts.set(command, (counts.get(command) ?? 0) + 1);
          }
          if (counts.size === 0) {
            out("No command runs logged yet.");
            return 0;
          }
          for (const [command, count] of [...counts].sort((a, b) => b[1] - a[1])) {
            out(`${String(count).padStart(6)}  /${command.replaceAll("/", " ")}`);
          }
          return 0;
        },
      },
    ],
  });
}
