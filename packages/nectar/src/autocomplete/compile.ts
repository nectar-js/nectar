import path from "node:path";
import type { CompiledCommand } from "../commands/compile.js";
import { Diagnostics } from "../compiler/diagnostics.js";
import { loadModule } from "../compiler/load.js";
import type { Route, RouteTable } from "../compiler/routes.js";

export interface CompiledAutocomplete {
  /** The `autocomplete.ts` route. Shares its identity with the sibling `command.ts`. */
  route: Route;
  /** The command route these handlers serve. */
  command: Route;
  /** Option names with a handler, sorted. Each is a named export of the file. */
  options: string[];
}

export interface CompiledAutocompletes {
  autocomplete: CompiledAutocomplete[];
  diagnostics: Diagnostics;
}

/**
 * Links every `autocomplete.ts` to its sibling command and checks that each named export
 * matches an option declared with `autocomplete: true`, and that no such option is left
 * without a handler.
 */
export async function compileAutocomplete(
  table: RouteTable,
  commands: CompiledCommand[],
): Promise<CompiledAutocompletes> {
  const diagnostics = new Diagnostics();
  const routes = table.routes.filter((r) => r.kind === "autocomplete");

  const targets = new Map<string, { command: Route; options: Set<string> }>();
  for (const command of commands) {
    for (const [key, route] of Object.entries(command.handlers)) {
      targets.set(route.id, { command: route, options: autocompleteOptions(command, key) });
    }
  }

  const results = await Promise.all(
    routes.map(async (route): Promise<CompiledAutocomplete | null> => {
      const target = targets.get(route.id);
      if (target === undefined) {
        // A command.ts that failed to compile has its own diagnostic already.
        if (table.routes.some((r) => r.id === route.id && r.kind === "command")) return null;
        diagnostics.error(
          "autocomplete-without-command",
          `autocomplete.ts needs a command.ts in the same directory. None was found for "${route.path}".`,
          { file: route.file, route: route.id },
        );
        return null;
      }

      let module: Record<string, unknown>;
      try {
        module = await loadModule(route.file);
      } catch (error) {
        diagnostics.error(
          "module-load-failed",
          `Could not import this file: ${error instanceof Error ? error.message : String(error)}`,
          { file: route.file, route: route.id },
        );
        return null;
      }

      const exported = Object.keys(module)
        .filter((name) => name !== "default")
        .sort();
      let ok = true;

      for (const name of exported) {
        if (typeof module[name] !== "function") {
          diagnostics.error(
            "autocomplete-export-not-function",
            `Export "${name}" must be a function that answers autocomplete for the "${name}" option.`,
            { file: route.file, route: route.id },
          );
          ok = false;
          continue;
        }
        if (!target.options.has(name)) {
          diagnostics.error(
            "autocomplete-unknown-option",
            `Export "${name}" does not match an option with \`autocomplete: true\` in ${relative(target.command.file)}. ${expected(target.options)}`,
            { file: route.file, route: route.id },
          );
          ok = false;
        }
      }

      for (const name of [...target.options].sort()) {
        if (exported.includes(name)) continue;
        diagnostics.error(
          "autocomplete-missing-handler",
          `Option "${name}" has \`autocomplete: true\` but ${relative(route.file)} does not export a "${name}" function.`,
          { file: route.file, route: route.id },
        );
        ok = false;
      }

      return ok ? { route, command: target.command, options: exported } : null;
    }),
  );

  for (const [id, target] of targets) {
    if (target.options.size === 0 || routes.some((r) => r.id === id)) continue;
    diagnostics.error(
      "autocomplete-missing-file",
      `${[...target.options].map((o) => `"${o}"`).join(", ")} ${target.options.size === 1 ? "has" : "have"} \`autocomplete: true\` but there is no autocomplete.ts next to this command.`,
      { file: target.command.file, route: id },
    );
  }

  return {
    autocomplete: results.filter((r): r is CompiledAutocomplete => r !== null),
    diagnostics,
  };
}

/** Names of the options with `autocomplete: true` for one handler position of a command. */
function autocompleteOptions(command: CompiledCommand, key: string): Set<string> {
  let options = (command.payload as PayloadNode).options;
  for (const part of key === "" ? [] : key.split("/")) {
    options = options?.find((o) => o.name === part)?.options;
  }
  return new Set(
    (options ?? []).filter((o) => o.autocomplete === true).map((o) => o.name as string),
  );
}

/** The parts of a registration payload the option walk needs. */
interface PayloadNode {
  name?: string;
  autocomplete?: boolean;
  options?: PayloadNode[];
}

function expected(options: Set<string>): string {
  return options.size === 0
    ? "The command declares no autocomplete options."
    : `Expected one of: ${[...options].sort().join(", ")}.`;
}

function relative(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}
